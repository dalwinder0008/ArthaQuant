# Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership**: Every document under `/users/{userId}` and its subcollections (`holdings`, `manualAssets`, `alerts`) belongs strictly to the authenticated, email-verified user whose `request.auth.uid == userId`.
2. **No PII Leakage**: User profile documents containing `email` and `displayName` are never listable (`allow list: if false`) and never readable by any other authenticated or unauthenticated user.
3. **Immutable Ownership & Creation Timestamps**: `uid` / `userId` and `createdAt` can never be mutated after creation.
4. **Server-Enforced Temporal Integrity**: `createdAt` on create and `updatedAt` on create/update must strictly equal `request.time`.
5. **Bounded Types & Strict Keys**: Every collection enforces exact `hasAll` and `hasOnly` key allowlists on `create`, and exact `affectedKeys().hasOnly(...)` allowlists on `update`, preventing shadow fields and denial-of-wallet oversized strings.
6. **Parent Existence & ID Integrity**: Subcollection creates verify `exists(/databases/$(database)/documents/users/$(userId))` and enforce `id == docId` matching `^[a-zA-Z0-9_\-]+$`.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Cross-user profile read**: User A attempts `get /users/userB`.
2. **Users collection scrape**: Any user attempts `list /users`.
3. **Unverified email write**: Authenticated user with `email_verified == false` attempts `create /users/{uid}`.
4. **Shadow privilege field**: User attempts `create /users/{uid}` with extra field `isAdmin: true`.
5. **Client timestamp forgery**: User attempts `create /users/{uid}/holdings/{id}` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`.
6. **Ownership spoofing on subcollection**: User A attempts `create /users/userA/holdings/h1` with `userId: "userB"`.
7. **Cross-user holding list**: User A attempts `list /users/userB/holdings`.
8. **Negative quantity / price injection**: User attempts `create /users/{uid}/holdings/h1` with `quantity: -5` or `buyPrice: 0`.
9. **Oversized ID poisoning**: User attempts `create /users/{uid}/holdings/<200-char-invalid-id!>` failing `isValidId()`.
10. **Immutable field mutation**: User attempts `update /users/{uid}/holdings/h1` changing `userId` or `createdAt`.
11. **Shadow field on update**: User attempts `update /users/{uid}/alerts/a1` adding `priorityOverride: 999`.
12. **Invalid enum injection**: User attempts `create /users/{uid}/holdings/h1` with `assetClass: "Derivatives"` or `currency: "EUR"`.
