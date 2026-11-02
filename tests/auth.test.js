import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app.js';
import User from '../src/models/User.js';
import { generateAccessToken, generateRefreshToken } from '../src/utils/jwt.js';

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/auth-test';

describe('Auth API', () => {
  let server;
  let testUser;
  let accessToken;
  let refreshToken;

  beforeAll(async () => {
    await mongoose.connect(TEST_DB_URI);
    server = app.listen(0);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    server.close();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    
    // Create test user
    testUser = await User.create({
      email: 'test@example.com',
      password: 'TestPass123!',
      name: 'Test User',
      isEmailVerified: true,
    });

    accessToken = generateAccessToken(testUser);
    refreshToken = generateRefreshToken(testUser);
    
    testUser.addRefreshToken(refreshToken, 'test-agent', '127.0.0.1');
    await testUser.save();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(server)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePass123!',
          name: 'New User',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('newuser@example.com');
      expect(res.body.data.user.name).toBe('New User');
      expect(res.body.data.user.isEmailVerified).toBe(false);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('should reject duplicate email', async () => {
      const res = await request(server)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          name: 'Test User',
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already registered');
    });

    it('should validate password requirements', async () => {
      const res = await request(server)
        .post('/api/auth/register')
        .send({
          email: 'test2@example.com',
          password: 'weak',
          name: 'Test User',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('should validate email format', async () => {
      const res = await request(server)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'SecurePass123!',
          name: 'Test User',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'TestPass123!',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('test@example.com');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('should reject invalid password', async () => {
      const res = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPass123!',
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should reject non-existent user', async () => {
      const res = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPass123!',
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      const res = await request(server)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(refreshToken); // Token rotation
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(server)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should detect token reuse', async () => {
      // Use the same refresh token twice
      await request(server)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      const res = await request(server)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  describe('Protected routes', () => {
    it('should access profile with valid token', async () => {
      const res = await request(server)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('test@example.com');
    });

    it('should reject request without token', async () => {
      const res = await request(server)
        .get('/api/auth/profile')
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should reject request with invalid token', async () => {
      const res = await request(server)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should logout and invalidate refresh token', async () => {
      const res = await request(server)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);

      // Try to use the same refresh token
      const refreshRes = await request(server)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(refreshRes.body.success).toBe(false);
    });

    it('should change password', async () => {
      const res = await request(server)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'TestPass123!',
          newPassword: 'NewSecurePass123!',
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      // Old token should be invalidated
      const profileRes = await request(server)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(profileRes.body.success).toBe(false);
    });
  });

  describe('Email verification', () => {
    it('should verify email with valid token', async () => {
      const unverifiedUser = await User.create({
        email: 'unverified@example.com',
        password: 'TestPass123!',
        name: 'Unverified User',
        isEmailVerified: false,
      });

      const token = unverifiedUser.generateEmailVerificationToken();
      await unverifiedUser.save();

      const res = await request(server)
        .post('/api/auth/verify-email')
        .send({ token })
        .expect(200);

      expect(res.body.success).toBe(true);

      const updatedUser = await User.findById(unverifiedUser._id);
      expect(updatedUser.isEmailVerified).toBe(true);
    });

    it('should reject invalid verification token', async () => {
      const res = await request(server)
        .post('/api/auth/verify-email')
        .send({ token: 'invalid-uuid-token' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('Password reset', () => {
    it('should request password reset', async () => {
      const res = await request(server)
        .post('/api/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should not reveal if email exists', async () => {
      const res = await request(server)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should reset password with valid token', async () => {
      const user = await User.findOne({ email: 'test@example.com' });
      const token = user.generatePasswordResetToken();
      await user.save();

      const res = await request(server)
        .post('/api/auth/reset-password')
        .send({
          token,
          password: 'NewResetPass123!',
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify new password works
      const loginRes = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'NewResetPass123!',
        })
        .expect(200);

      expect(loginRes.body.success).toBe(true);
    });
  });
});