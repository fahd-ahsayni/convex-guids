# Complete Guide: Convex Auth + Resend Email Setup

A comprehensive guide to implementing email authentication (OTP verification and password reset) using Convex Auth with Resend.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Resend Setup](#resend-setup)
5. [Backend Configuration](#backend-configuration)
6. [Frontend Implementation](#frontend-implementation)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)
9. [Production Checklist](#production-checklist)

---

## Overview

This setup provides:
- ✅ Email verification for sign up (OTP codes)
- ✅ Password reset via email (OTP codes)
- ✅ Beautiful HTML email templates
- ✅ 8-digit verification codes
- ✅ 10-minute code expiration
- ✅ Support for both Convex Resend component and direct API

---

## Prerequisites

**Required packages:**
```json
{
  "@convex-dev/auth": "^0.0.x",
  "@convex-dev/resend": "^0.0.x",
  "resend": "^3.x.x",
  "@auth/core": "^0.x.x",
  "@oslojs/crypto": "^0.x.x"
}
```

**Accounts needed:**
- [Resend account](https://resend.com) (free tier available)
- [Convex account](https://convex.dev)

---

## Installation

### Step 1: Install Dependencies

```bash
bun add @convex-dev/auth @convex-dev/resend resend @oslojs/crypto
# or
npm install @convex-dev/auth @convex-dev/resend resend @oslojs/crypto
```

### Step 2: Install Auth Core Provider

```bash
bun add @auth/core
# or
npm install @auth/core
```

---

## Resend Setup

### Step 1: Create Resend Account

1. Go to [resend.com](https://resend.com)
2. Sign up for a free account
3. Verify your email address

### Step 2: Get API Key

1. Navigate to **API Keys** in the Resend dashboard
2. Click **Create API Key**
3. Name it (e.g., "Convex App")
4. Copy the API key (starts with `re_`)

### Step 3: Configure Domain (Production)

**For testing:** Use the default sandbox domain and send to verified emails only.

**For production:**
1. Add your domain in Resend dashboard
2. Add DNS records as instructed
3. Wait for verification
4. Update `from` address in email templates

### Step 4: Set Environment Variable in Convex

```bash
# In your terminal
npx convex env set AUTH_RESEND_KEY "re_your_api_key_here"
```

Or set it in the [Convex Dashboard](https://dashboard.convex.dev):
1. Go to your project
2. Click **Settings** → **Environment Variables**
3. Add `AUTH_RESEND_KEY` with your Resend API key

---

## Backend Configuration

### Step 1: Register Components

**File: `convex/convex.config.ts`**

```typescript
import { defineApp } from "convex/server";
import presence from "@convex-dev/presence/convex.config";
import resend from "@convex-dev/resend/convex.config";

const app = defineApp();
app.use(presence);  // If using presence
app.use(resend);    // Register Resend component

export default app;
```

### Step 2: Create Email Providers

**File: `convex/emails.ts`**

```typescript
"use node";

import ResendProvider from "@auth/core/providers/resend";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { components } from "./_generated/api";
import { Resend as ResendComponent } from "@convex-dev/resend";
import { action } from "./_generated/server";
import { v } from "convex/values";

// Initialize the Resend component (optional, for non-auth emails)
export const resend = new ResendComponent(components.resend, {
    testMode: false, // Set to true for testing
});

/**
 * Resend OTP Provider for Email Verification (Sign Up)
 */
export const ResendOTP = ResendProvider({
    id: "resend-otp",
    apiKey: process.env.AUTH_RESEND_KEY,
    maxAge: 60 * 10, // 10 minutes
    async generateVerificationToken() {
        const random: RandomReader = {
            read(bytes) {
                crypto.getRandomValues(bytes);
            },
        };

        const alphabet = "0123456789";
        const length = 8;
        return generateRandomString(random, alphabet, length);
    },
    async sendVerificationRequest({ identifier: email, provider, token }) {
        const { Resend } = await import("resend");
        const resendAPI = new Resend(provider.apiKey);
        
        try {
            const { error, data } = await resendAPI.emails.send({
                from: "contact@yourdomain.com", // Update this!
                to: [email],
                subject: "Sign in to My App",
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Email Verification</h2>
                        <p>Thank you for signing up! Your verification code is:</p>
                        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px;">
                            ${token}
                        </div>
                        <p>This code will expire in 10 minutes.</p>
                        <p>If you didn't create an account, please ignore this email.</p>
                    </div>
                `,
            });

            if (error) {
                console.error("Resend error:", JSON.stringify(error));
                throw new Error(`Could not send verification email: ${error.message || JSON.stringify(error)}`);
            }

            console.log("Verification email sent successfully:", data);
        } catch (error) {
            console.error("Failed to send verification email:", error);
            throw error;
        }
    },
});

/**
 * Resend OTP Provider for Password Reset
 */
export const ResendOTPPasswordReset = ResendProvider({
    id: "resend-otp-password-reset",
    apiKey: process.env.AUTH_RESEND_KEY,
    maxAge: 60 * 10, // 10 minutes
    async generateVerificationToken() {
        const random: RandomReader = {
            read(bytes) {
                crypto.getRandomValues(bytes);
            },
        };

        const alphabet = "0123456789";
        const length = 8;
        return generateRandomString(random, alphabet, length);
    },
    async sendVerificationRequest({ identifier: email, provider, token }) {
        const { Resend } = await import("resend");
        const resendAPI = new Resend(provider.apiKey);
        
        try {
            const { error, data } = await resendAPI.emails.send({
                from: "contact@yourdomain.com", // Update this!
                to: [email],
                subject: "Your Password Reset Code",
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Password Reset Code</h2>
                        <p>Your verification code is:</p>
                        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px;">
                            ${token}
                        </div>
                        <p>This code will expire in 10 minutes.</p>
                        <p>If you didn't request this code, please ignore this email.</p>
                    </div>
                `,
            });

            if (error) {
                console.error("Resend error:", JSON.stringify(error));
                throw new Error(`Could not send email: ${error.message || JSON.stringify(error)}`);
            }

            console.log("Password reset email sent successfully:", data);
        } catch (error) {
            console.error("Failed to send verification email:", error);
            throw error;
        }
    },
});

/**
 * Optional: Send custom emails using Convex Resend component
 * This uses queuing, batching, and retry features
 */
export const sendCustomEmail = action({
    args: {
        to: v.string(),
        subject: v.string(),
        html: v.string(),
    },
    handler: async (ctx, args) => {
        const emailId = await resend.sendEmail(ctx, {
            from: "contact@yourdomain.com",
            to: args.to,
            subject: args.subject,
            html: args.html,
        });

        console.log("Email queued with ID:", emailId);
        return { success: true, emailId };
    },
});
```

**Important:** Update `from: "contact@yourdomain.com"` to your actual verified domain!

### Step 3: Configure Auth

**File: `convex/auth.ts`**

```typescript
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import GitHub from "@auth/core/providers/github";
import { ResendOTPPasswordReset, ResendOTP } from "./emails";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({ 
      reset: ResendOTPPasswordReset,  // Password reset via email
      verify: ResendOTP                // Email verification for sign up
    }), 
    GitHub  // Optional: OAuth provider
  ],
});
```

### Step 4: Configure Auth HTTP Routes

**File: `convex/http.ts`**

```typescript
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

export default http;
```

### Step 5: Create Auth Config

**File: `convex/auth.config.ts`**

```typescript
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
```

---

## Frontend Implementation

### Step 1: Set Up Auth Provider

**File: `app/_layout.tsx` (or your root layout)**

```tsx
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!);

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <ConvexAuthProvider>
        {/* Your app content */}
      </ConvexAuthProvider>
    </ConvexProvider>
  );
}
```

### Step 2: Sign Up with Email Verification

**File: `app/sign-up.tsx`**

```tsx
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { View, TextInput, Button, Alert } from "react-native";

export default function SignUpScreen() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");

  const handleSendCode = async () => {
    try {
      await signIn("resend-otp", { email });
      setStep("code");
      Alert.alert("Success", "Check your email for verification code");
    } catch (error) {
      Alert.alert("Error", "Failed to send code");
    }
  };

  const handleVerifyCode = async () => {
    try {
      await signIn("resend-otp", { email, code });
      // User is now signed in
    } catch (error) {
      Alert.alert("Error", "Invalid code");
    }
  };

  if (step === "email") {
    return (
      <View>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Button title="Send Code" onPress={handleSendCode} />
      </View>
    );
  }

  return (
    <View>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="8-digit code"
        keyboardType="number-pad"
        maxLength={8}
      />
      <Button title="Verify" onPress={handleVerifyCode} />
    </View>
  );
}
```

### Step 3: Password Reset Flow

**File: `app/forgot-password.tsx`**

```tsx
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { View, TextInput, Button, Alert } from "react-native";

export default function ForgotPasswordScreen() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const handleSendResetCode = async () => {
    try {
      await signIn("resend-otp-password-reset", { email });
      setStep("code");
      Alert.alert("Success", "Check your email for reset code");
    } catch (error) {
      Alert.alert("Error", "Failed to send reset code");
    }
  };

  const handleVerifyCode = async () => {
    try {
      await signIn("resend-otp-password-reset", { email, code });
      setStep("password");
    } catch (error) {
      Alert.alert("Error", "Invalid code");
    }
  };

  const handleResetPassword = async () => {
    try {
      await signIn("resend-otp-password-reset", {
        email,
        code,
        newPassword,
      });
      Alert.alert("Success", "Password reset successfully");
      // Navigate to sign in
    } catch (error) {
      Alert.alert("Error", "Failed to reset password");
    }
  };

  if (step === "email") {
    return (
      <View>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          keyboardType="email-address"
        />
        <Button title="Send Reset Code" onPress={handleSendResetCode} />
      </View>
    );
  }

  if (step === "code") {
    return (
      <View>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="8-digit code"
          keyboardType="number-pad"
          maxLength={8}
        />
        <Button title="Verify Code" onPress={handleVerifyCode} />
      </View>
    );
  }

  return (
    <View>
      <TextInput
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder="New Password"
        secureTextEntry
      />
      <Button title="Reset Password" onPress={handleResetPassword} />
    </View>
  );
}
```

### Step 4: Check Auth State

```tsx
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function MyComponent() {
  const user = useQuery(api.users.viewer);
  
  if (user === undefined) {
    return <Text>Loading...</Text>;
  }
  
  if (user === null) {
    return <Text>Not signed in</Text>;
  }
  
  return <Text>Welcome {user.email}</Text>;
}
```

---

## Testing

### Development Testing

**Test with Resend sandbox:**
1. Keep `testMode: true` in component options
2. Send to test addresses: `delivered@resend.dev`
3. Check Resend dashboard for email logs

**Test OTP flow:**
```typescript
// Sign up flow
await signIn("resend-otp", { email: "test@example.com" });
// Check email for code
await signIn("resend-otp", { email: "test@example.com", code: "12345678" });

// Password reset flow
await signIn("resend-otp-password-reset", { email: "test@example.com" });
// Check email for code
await signIn("resend-otp-password-reset", { 
  email: "test@example.com", 
  code: "12345678",
  newPassword: "newpass123"
});
```

### Testing Checklist

- [ ] Email sends successfully
- [ ] Code arrives within seconds
- [ ] Code is 8 digits
- [ ] Code expires after 10 minutes
- [ ] Invalid code shows error
- [ ] Expired code shows error
- [ ] Email template looks good on mobile/desktop
- [ ] HTML fallback works (view plain text version)

---

## Troubleshooting

### Issue: "Property 'resend' does not exist"

**Cause:** Resend component types not generated  
**Solution:** Restart Convex dev server
```bash
# Stop and restart
bun run dev
```

### Issue: "Could not send email"

**Causes:**
1. Invalid API key
2. Unverified domain
3. Rate limiting

**Solutions:**
1. Check `AUTH_RESEND_KEY` in Convex dashboard
2. Verify domain in Resend dashboard
3. Check Resend dashboard for errors
4. For testing, use `delivered@resend.dev`

### Issue: Code not received

**Check:**
1. Spam folder
2. Resend dashboard logs
3. Console logs in Convex dashboard
4. Email address is correct

### Issue: "Auth provider not found"

**Cause:** Auth routes not configured  
**Solution:** Check `convex/http.ts` has `auth.addHttpRoutes(http)`

### Issue: Invalid code error

**Causes:**
1. Code expired (>10 minutes)
2. Wrong code entered
3. Code already used

**Solution:** Request new code

---

## Production Checklist

### Before Launch

- [ ] Set up custom domain in Resend
- [ ] Verify domain DNS records
- [ ] Update `from` email address in both providers
- [ ] Set `testMode: false` in Resend component
- [ ] Test email delivery to real addresses
- [ ] Test on multiple email providers (Gmail, Outlook, etc.)
- [ ] Check spam score (use mail-tester.com)
- [ ] Set up DMARC, DKIM, SPF records
- [ ] Add unsubscribe link if sending marketing emails
- [ ] Test rate limits
- [ ] Monitor Resend dashboard for bounces/complaints

### Environment Variables

**Required:**
```
AUTH_RESEND_KEY=re_your_production_key
CONVEX_SITE_URL=https://your-site.com
```

**Optional:**
```
RESEND_WEBHOOK_SECRET=whsec_your_secret (for webhooks)
```

### Security Best Practices

1. **Never commit API keys** to git
2. **Use environment variables** for all secrets
3. **Verify domain ownership** in Resend
4. **Monitor for abuse** in Resend dashboard
5. **Rate limit sign-up attempts** in your app
6. **Use CAPTCHA** for public sign-up forms
7. **Log suspicious activity**

### Performance Optimization

1. **Use Convex Resend component** for non-auth emails (queuing + batching)
2. **Monitor email delivery times** in Resend dashboard
3. **Set up webhooks** to track delivery status
4. **Cache user verification status**

---

## Advanced: Webhook Setup (Optional)

If you want to track email delivery status:

### Step 1: Add Webhook Handler

**File: `convex/http.ts`**

```typescript
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { resend } from "./emails";

const http = httpRouter();

auth.addHttpRoutes(http);

// Resend webhook
http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await resend.handleResendEventWebhook(ctx, req);
  }),
});

export default http;
```

### Step 2: Configure Webhook in Resend

1. Go to Resend Dashboard → Webhooks
2. Add webhook URL: `https://your-project.convex.site/resend-webhook`
3. Enable `email.*` events
4. Copy webhook secret
5. Set in Convex: `npx convex env set RESEND_WEBHOOK_SECRET "whsec_..."`

---

## Email Template Customization

### Custom Branding

Update the HTML templates in `convex/emails.ts`:

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <!-- Add logo -->
    <img src="https://yourdomain.com/logo.png" alt="Logo" style="height: 40px; margin-bottom: 20px;">
    
    <h2 style="color: #333;">Email Verification</h2>
    
    <p style="color: #666; line-height: 1.6;">
        Thank you for signing up! Your verification code is:
    </p>
    
    <!-- Styled code box -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                padding: 20px; 
                text-align: center; 
                border-radius: 8px;
                margin: 20px 0;">
        <span style="color: white; 
                     font-size: 32px; 
                     font-weight: bold; 
                     letter-spacing: 5px;
                     font-family: monospace;">
            ${token}
        </span>
    </div>
    
    <p style="color: #666; font-size: 14px;">
        This code will expire in 10 minutes.
    </p>
    
    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #999; font-size: 12px; text-align: center;">
        © 2025 Your Company. All rights reserved.
    </p>
</div>
```

---

## Summary

You now have a complete email authentication system with:

✅ Email verification (sign up)  
✅ Password reset via email  
✅ Beautiful HTML email templates  
✅ 8-digit OTP codes  
✅ 10-minute expiration  
✅ Convex Resend component for additional emails  
✅ Production-ready setup  

**Key Files:**
- `convex/convex.config.ts` - Component registration
- `convex/emails.ts` - Email providers and templates
- `convex/auth.ts` - Auth configuration
- `convex/http.ts` - HTTP routes
- Frontend sign-up/password reset screens

**Next Steps:**
1. Customize email templates with your branding
2. Test thoroughly in development
3. Set up custom domain in Resend
4. Deploy to production
5. Monitor email delivery in Resend dashboard

For questions, check:
- [Convex Auth Docs](https://docs.convex.dev/auth)
- [Resend Docs](https://resend.com/docs)
- [Convex Discord](https://convex.dev/community)

---

**Built with ❤️ using Convex + Resend**
