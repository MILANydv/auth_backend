# Authentication Backend

A production-ready authentication backend built with Express, Mongoose, and MongoDB Atlas featuring JWT authentication, email verification, password reset, and rate limiting.

## Features

- 🔐 **JWT Authentication** - Access tokens (15min) + Refresh tokens (7d)
- 📧 **Email Verification** - Secure email verification flow
- 🔑 **Password Reset** - Forgot/Reset password with secure tokens
- 🛡️ **Rate Limiting** - Global and auth-specific rate limiting
- 🔒 **Security** - Helmet, CORS, bcrypt password hashing, account locking
- 🍪 **HttpOnly Cookies** - Secure token storage
- 📝 **Input Validation** - Express-validator with detailed error messages
- 🏗️ **Modular Architecture** - Clean separation of concerns

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express 4.x
- **Database**: MongoDB Atlas with Mongoose 8.x
- **Auth**: JSON Web Tokens (JWT)
- **Email**: Nodemailer
- **Validation**: express-validator
- **Security**: helmet, cors, express-rate-limit

## Project Structure

```
src/
├── config/
│   ├── database.js      # MongoDB connection
│   └── email.js         # Nodemailer configuration
├── controllers/
│   └── authController.js # Authentication logic
├── middleware/
│   └── auth.js          # JWT authentication & authorization
├── models/
│   └── User.js          # User schema with methods
├── routes/
│   └── authRoutes.js    # API route definitions
├── utils/
│   ├── errors.js        # Custom error classes
│   ├── jwt.js           # Token generation/verification
│   └── response.js      # Standardized API responses
├── validators/
│   └── authValidators.js # Request validation rules
├── app.js               # Express app setup
└── index.js             # Entry point
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB Atlas account
- Email service (Gmail, SendGrid, etc.)

### Installation

```bash
# Clone and navigate
cd auth-backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Configure .env with your credentials
# Edit .env with your MongoDB URI, JWT secrets, email credentials
```

### Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# MongoDB Atlas
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/auth-db

# JWT (generate strong secrets for production!)
JWT_SECRET=your-32-char-min-secret-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-32-char-min-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

# Email (Gmail example)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com

# Frontend URL for email links
FRONTEND_URL=http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5
```

### Running the Server

```bash
# Development (with file watching)
npm run dev

# Production
npm start
```

## API Endpoints

### Public Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/verify-email` | Verify email with token |
| POST | `/api/auth/resend-verification` | Resend verification email |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |

### Protected Routes (Require Authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/logout` | Logout (invalidate refresh token) |
| POST | `/api/auth/logout-all` | Logout from all devices |
| POST | `/api/auth/change-password` | Change password |
| GET | `/api/auth/profile` | Get current user profile |
| PATCH | `/api/auth/profile` | Update profile |
| GET | `/api/auth/sessions` | List active sessions |
| DELETE | `/api/auth/sessions` | Revoke specific session |

## Request/Response Examples

### Register
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "name": "John Doe"
  }'
```

**Response (201):**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account.",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "isEmailVerified": false
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

### Refresh Token
```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "eyJhbGciOiJIUzI1NiIs..."}'
```

### Verify Email
```bash
curl -X POST http://localhost:3000/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"token": "uuid-token-from-email"}'
```

### Forgot Password
```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

### Reset Password
```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "uuid-token-from-email",
    "password": "NewSecurePass123!"
  }'
```

### Get Profile (Authenticated)
```bash
curl -X GET http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

## Security Features

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (@$!%*?&)

### Account Protection
- Account locks after 5 failed login attempts (15 min)
- Refresh token rotation (new token on each refresh)
- Token reuse detection (invalidates all tokens on reuse)
- HttpOnly, Secure, SameSite cookies
- bcrypt with 12 rounds

### Rate Limiting
- Global: 100 requests per 15 minutes
- Auth endpoints: 5 requests per 15 minutes

## Email Templates

The system sends two types of emails:
1. **Email Verification** - 24 hour expiry
2. **Password Reset** - 1 hour expiry

Customize templates in `src/config/email.js`.

## Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch
```

## Deployment

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Use strong JWT secrets (32+ chars)
- [ ] Enable HTTPS
- [ ] Configure proper CORS origin
- [ ] Use environment-specific MongoDB URI
- [ ] Set up email service (SendGrid, Mailgun, etc.)
- [ ] Configure reverse proxy (nginx)
- [ ] Enable MongoDB Atlas IP whitelist
- [ ] Set up monitoring/logging

### Docker (Optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## License

MIT