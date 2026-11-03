# 10. Backend Development Priorities and Constraints

## 10.1 Phase 1: Must Implement Immediately

1. Fully functional Forgot Password (2.2).
2. Security requirements 8.1–8.5: password hashing, password rules, account lockout, inactivity timeout, HTTPS (2.3.1–2.3.5).
3. Complete service price list (3.1).
4. Server-side enforcement of the non-refundable deposit acknowledgment (5.2).
5. Terms & Conditions acceptance during registration (2.1.5, 2.1.6).

## 10.2 Phase 2: Next Implementation Priorities

1. Complete booking workflow API (4.1).
2. Appointment slot locking to prevent double bookings (4.3).
3. Payment processing and transaction recording (5).
4. Client and administrator cancellation reasons (4.2).

## 10.3 Phase 3: Later Enhancements

1. Daily and monthly sales reports (7.3).
2. Administrator activity logs (7.4).
3. Booking confirmation and appointment reminder notifications (6.4, 6.5).

## 10.4 Development Constraints (Ref 17)

1. The backend must be written in **C#** using **Visual Studio 2026**.
2. The implementation must follow all requirements, pricing rules, security measures, SOLID principles, ACID properties, testing procedures, and priorities documented here.
3. **Clarification:** Stone add-on prices are assumed per nail; confirm with Kyla's official price list before finalizing price logic.

**Final objective:** A secure, functional, maintainable, mobile-responsive, web-based nail salon booking and management system that supports Client and Administrator operations while preserving transaction accuracy, enforcing booking policies, and protecting user information.
