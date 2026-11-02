import User from '../models/User.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../config/email.js';
import {
  AppError,
  AuthenticationError,
  ValidationError,
  ConflictError,
  NotFoundError
} from '../utils/errors.js';
import { sendSuccess, sendError } from '../utils/response.js';

const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Create user
    const user = await User.create({
      email,
      password,
      name,
    });

    // Generate email verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    // Send verification email
    try {
      await sendVerificationEmail(user.email, verificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail registration if email fails
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token
    user.addRefreshToken(refreshToken, req.get('User-Agent'), req.ip);
    await user.save();

    // Set cookies
    setTokenCookies(res, accessToken, refreshToken);

    sendSuccess(res, {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
      accessToken,
      refreshToken,
    }, 'Registration successful. Please check your email to verify your account.', 201);
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user with password
    const user = await User.findOne({ email }).select('+password +refreshTokens +loginAttempts +lockUntil');

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Check if account is locked
    if (user.isLocked) {
      const lockTime = Math.ceil((user.lockUntil - Date.now()) / 1000 / 60);
      throw new AuthenticationError(`Account locked. Try again in ${lockTime} minutes.`);
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      await user.incrementLoginAttempts();
      throw new AuthenticationError('Invalid email or password');
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token
    user.addRefreshToken(refreshToken, req.get('User-Agent'), req.ip);
    await user.save();

    // Set cookies
    setTokenCookies(res, accessToken, refreshToken);

    sendSuccess(res, {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
      accessToken,
      refreshToken,
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken && req.user) {
      // Remove refresh token from user
      req.user.removeRefreshToken(refreshToken);
      await req.user.save();
    }

    // Clear cookies
    clearTokenCookies(res);

    sendSuccess(res, null, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

const logoutAll = async (req, res, next) => {
  try {
    if (req.user) {
      // Remove all refresh tokens
      req.user.refreshTokens = [];
      await req.user.save();
    }

    // Clear cookies
    clearTokenCookies(res);

    sendSuccess(res, null, 'Logged out from all devices');
  } catch (error) {
    next(error);
  }
};

const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AuthenticationError('Refresh token required');
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    // Find user and check if refresh token exists
    const user = await User.findById(decoded.id).select('+refreshTokens');

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Check if refresh token exists in user's tokens
    const tokenExists = user.refreshTokens.some(rt => rt.token === refreshToken);
    if (!tokenExists) {
      // Token reuse detected - remove all tokens for security
      user.refreshTokens = [];
      await user.save();
      throw new AuthenticationError('Invalid refresh token');
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Replace old refresh token with new one
    user.removeRefreshToken(refreshToken);
    user.addRefreshToken(newRefreshToken, req.get('User-Agent'), req.ip);
    await user.save();

    // Set new cookies
    setTokenCookies(res, newAccessToken, newRefreshToken);

    sendSuccess(res, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    }, 'Token refreshed successfully');
  } catch (error) {
    next(error);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw new ValidationError('Invalid or expired verification token');
    }

    user.isEmailVerified = true;
    user.clearVerificationTokens();
    await user.save();

    sendSuccess(res, null, 'Email verified successfully');
  } catch (error) {
    next(error);
  }
};

const resendVerificationEmail = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if email exists
      return sendSuccess(res, null, 'If the email exists, a verification email has been sent');
    }

    if (user.isEmailVerified) {
      throw new ValidationError('Email is already verified');
    }

    // Generate new verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    // Send verification email
    try {
      await sendVerificationEmail(user.email, verificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      throw new AppError('Failed to send verification email', 500);
    }

    sendSuccess(res, null, 'Verification email sent');
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if email exists
      return sendSuccess(res, null, 'If the email exists, a password reset link has been sent');
    }

    // Generate password reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save();

    // Send password reset email
    try {
      await sendPasswordResetEmail(user.email, resetToken);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      user.clearVerificationTokens();
      await user.save();
      throw new AppError('Failed to send password reset email', 500);
    }

    sendSuccess(res, null, 'Password reset email sent');
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+password');

    if (!user) {
      throw new ValidationError('Invalid or expired reset token');
    }

    user.password = password;
    user.clearVerificationTokens();
    user.refreshTokens = []; // Invalidate all refresh tokens
    await user.save();

    sendSuccess(res, null, 'Password reset successful. Please log in with your new password.');
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select('+password');

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    user.password = newPassword;
    user.refreshTokens = []; // Invalidate all refresh tokens
    await user.save();

    // Clear cookies since tokens are invalidated
    clearTokenCookies(res);

    sendSuccess(res, null, 'Password changed successfully. Please log in again.');
  } catch (error) {
    next(error);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    sendSuccess(res, {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
    }, 'Profile retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;

    const user = await User.findById(req.user.id);

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new ConflictError('Email already in use');
      }
      user.email = email;
      user.isEmailVerified = false; // Require re-verification
    }

    if (name) {
      user.name = name;
    }

    await user.save();

    sendSuccess(res, {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    }, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};

const getActiveSessions = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+refreshTokens');

    const sessions = user.refreshTokens.map(token => ({
      token: token.token.substring(0, 10) + '...',
      userAgent: token.userAgent,
      ip: token.ip,
      createdAt: token.createdAt,
    }));

    sendSuccess(res, { sessions }, 'Active sessions retrieved');
  } catch (error) {
    next(error);
  }
};

const revokeSession = async (req, res, next) => {
  try {
    const { token } = req.body;

    const user = await User.findById(req.user.id).select('+refreshTokens');
    user.removeRefreshToken(token);
    await user.save();

    sendSuccess(res, null, 'Session revoked');
  } catch (error) {
    next(error);
  }
};

// Helper functions
const setTokenCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

const clearTokenCookies = (res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
};

export default {
  register,
  login,
  logout,
  logoutAll,
  refreshAccessToken,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  changePassword,
  getProfile,
  updateProfile,
  getActiveSessions,
  revokeSession,
};
