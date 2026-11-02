import express from 'express';
import authController from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import {
  registerValidator,
  loginValidator,
  verifyEmailValidator,
  resendVerificationValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  refreshTokenValidator,
  changePasswordValidator,
  updateProfileValidator,
} from '../validators/authValidators.js';

const router = express.Router();

// Public routes
router.post('/register', registerValidator, authController.register);
router.post('/login', loginValidator, authController.login);
router.post('/refresh', refreshTokenValidator, authController.refreshAccessToken);
router.post('/verify-email', verifyEmailValidator, authController.verifyEmail);
router.post('/resend-verification', resendVerificationValidator, authController.resendVerificationEmail);
router.post('/forgot-password', forgotPasswordValidator, authController.forgotPassword);
router.post('/reset-password', resetPasswordValidator, authController.resetPassword);

// Protected routes
router.use(authenticate); // All routes below require authentication

router.post('/logout', authController.logout);
router.post('/logout-all', authController.logoutAll);
router.post('/change-password', changePasswordValidator, authController.changePassword);
router.get('/profile', authController.getProfile);
router.patch('/profile', updateProfileValidator, authController.updateProfile);
router.get('/sessions', authController.getActiveSessions);
router.delete('/sessions', authController.revokeSession);

export default router;
