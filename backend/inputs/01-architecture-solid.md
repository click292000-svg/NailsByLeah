# 1. Architecture and SOLID Principles

## 1.1 Layered Architecture

| No. | Ref | Requirement |
|---|---|---|
| 1.1.1 | 14.1 | Use a layered architecture: **Controller → Service → Repository**. |
| 1.1.2 | 14.2 | Centralize validation rules so the same logic is not duplicated across endpoints. |
| 1.1.3 | 14.3 | Store sensitive configuration (database passwords, API keys) in environment variables / user secrets, never in source code. |
| 1.1.4 | 14.4 | Implement global exception handling and application logging for error tracking. |
| 1.1.5 | 14.5 | Include code comments where needed and a README with setup and installation instructions. |

## 1.2 Single Responsibility Principle (Ref 5.1)

Each class has one clearly defined responsibility:

1. **AuthService** — user authentication and login.
2. **PasswordResetService** — password recovery and reset.
3. **BookingService** — creating and managing bookings.
4. **PaymentService** — processing and managing payments.
5. **PriceService** — service pricing and price calculations.

## 1.3 Open/Closed Principle (Ref 5.2)

New services and add-ons must be added through database entries or new classes without modifying existing functional code.

## 1.4 Liskov Substitution Principle (Ref 5.3)

All service types — **SoftGel, Stone, Removal** — inherit from a common base `Service` class and must be usable anywhere `Service` is expected.

## 1.5 Interface Segregation Principle (Ref 5.4)

Use small, specialized interfaces:

1. `IAuthenticatable`
2. `IPayable`
3. `ICancellable`

Client and Administrator components depend only on the interfaces relevant to them.

## 1.6 Dependency Inversion Principle (Ref 5.5)

Controllers depend on abstractions, e.g. `IBookingRepository` and `INotificationService`, registered through ASP.NET Core dependency injection — not on concrete database or email classes.
