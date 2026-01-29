# 🌟 Meytle - Premium Companion Booking Platform

> A sophisticated full-stack platform connecting clients with verified companions for social experiences.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-orange)](https://www.mysql.com/)

---

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/meytle.git
cd meytle

# Install dependencies
npm install

# Setup environment variables
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Start development
npm run dev
```

**Detailed Setup:** See [`docs/QUICK_SETUP.md`](docs/QUICK_SETUP.md)  
**Deployment Guide:** See [`docs/VPS_DEPLOYMENT_GUIDE.md`](docs/VPS_DEPLOYMENT_GUIDE.md)

---

## 📋 Features

### For Clients
- ✅ Browse verified companions with interests & services
- ✅ Real-time availability checking
- ✅ Secure booking system with payment integration
- ✅ In-booking messaging
- ✅ Review & rating system
- ✅ Favorite companions
- ✅ Identity verification

### For Companions
- ✅ Comprehensive application process
- ✅ Weekly availability management
- ✅ Booking request system
- ✅ Earnings dashboard
- ✅ Profile customization with interests
- ✅ Photo upload & management

### For Admins
- ✅ Application approval workflow
- ✅ User management
- ✅ Booking oversight
- ✅ System analytics
- ✅ Content moderation

---

## 🛠️ Tech Stack

### Frontend
- **React 19** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS v4** for styling
- **React Router** for navigation
- **Axios** for API calls

### Backend
- **Node.js 22** with Express
- **MySQL 8+** for database
- **JWT** authentication
- **Multer** for file uploads
- **Resend** for email service
- **Winston** for logging

### Infrastructure
- **VPS Hosting** (Hostinger)
- **Nginx** as reverse proxy
- **PM2** for process management
- **Let's Encrypt** for SSL

---

## 📊 Project Structure

```
meytle/
├── backend/              # Node.js Express API
│   ├── config/          # Database, multer configs
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Auth, validation, security
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Helper functions
│   └── uploads/         # File storage (profiles, documents)
│
├── frontend/            # React TypeScript SPA
│   ├── src/
│   │   ├── api/        # API client functions
│   │   ├── components/ # Reusable components
│   │   ├── pages/      # Page components
│   │   ├── hooks/      # Custom React hooks
│   │   ├── contexts/   # Context providers
│   │   ├── types/      # TypeScript types
│   │   └── utils/      # Frontend utilities
│   └── dist/           # Production build
│
├── shared/              # Shared types & constants
├── docs/                # Comprehensive documentation
└── README.md            # This file
```

---

## 📚 Documentation

### Getting Started
- [Quick Setup Guide](docs/QUICK_SETUP.md) - Start development in 5 minutes
- [VPS Deployment Guide](docs/VPS_DEPLOYMENT_GUIDE.md) - Deploy to production
- [Project Documentation](docs/PROJECT_DOCUMENTATION.md) - Complete feature docs

### Configuration
- [Database & Storage Plan](docs/DATABASE_AND_STORAGE_PLAN.md) - DB schema & photo storage
- [Email Setup (Resend)](docs/RESEND_SETUP.md) - Configure email service
- [Architecture Overview](docs/ARCHITECTURE.md) - System design

### Features
- [Location System Analysis](docs/CURRENT_LOCATION_ANALYSIS.md) - GPS & proximity features
- [Veriff Integration](docs/VERIFF_INTEGRATION.md) - Identity verification
- [Complete Feature Summary](docs/COMPLETE_FEATURE_SUMMARY.md) - All features documented

---

## 🔐 Security

- ✅ JWT authentication with HTTP-only cookies
- ✅ Password hashing with bcrypt
- ✅ Email verification required
- ✅ Role-based access control (RBAC)
- ✅ Rate limiting on sensitive endpoints
- ✅ SQL injection prevention
- ✅ XSS protection
- ✅ CORS configuration
- ✅ Content security policies
- ✅ Input validation & sanitization

---

## 🌐 API Endpoints

### Authentication
```
POST   /api/auth/signup            Register new user
POST   /api/auth/login             Login user
GET    /api/auth/profile           Get user profile
POST   /api/auth/verify-email      Verify email
POST   /api/auth/switch-role       Switch active role
POST   /api/auth/signout           Logout user
```

### Bookings
```
POST   /api/booking                Create booking
GET    /api/booking                Get user bookings
PATCH  /api/booking/:id            Update booking status
POST   /api/booking/requests       Create custom request
GET    /api/booking/companion/:id/availability  Get availability
```

### Companions
```
POST   /api/companion/application  Submit application
GET    /api/companions/approved    Browse companions
GET    /api/companion/profile/:id  Get companion profile
PATCH  /api/companion/profile      Update profile
```

**Full API Documentation:** See [`docs/PROJECT_DOCUMENTATION.md`](docs/PROJECT_DOCUMENTATION.md#api-endpoints)

---

## 🗄️ Database

### Core Tables (14 Essential)
- `users` - User accounts
- `user_roles` - Multi-role support
- `companion_applications` - Companion profiles
- `client_verifications` - Client verification
- `bookings` - Confirmed bookings
- `booking_requests` - Custom requests
- `companion_availability` - Weekly schedules
- `service_categories` - Service types
- `companion_interests` - Interest tags
- `favorite_companions` - Saved favorites
- `booking_reviews` - Reviews & ratings
- `messages` - In-booking chat
- `notifications` - Push notifications
- `notification_preferences` - Settings

**Database Schema:** See [`docs/DATABASE_AND_STORAGE_PLAN.md`](docs/DATABASE_AND_STORAGE_PLAN.md)

---

## 🚀 Deployment

### Prerequisites
- VPS with Node.js 22+, MySQL 8+, Nginx
- Domain name pointed to VPS IP
- SMTP credentials (Resend API key)

### Quick Deploy
```bash
# 1. Clone repository on VPS
git clone https://github.com/YOUR_USERNAME/meytle.git
cd meytle

# 2. Setup backend
cd backend
npm install
cp .env.example .env
# Edit .env with your credentials
npm start  # Auto-creates database tables!

# 3. Setup frontend
cd ../frontend
npm install
npm run build

# 4. Configure Nginx & SSL
# See docs/VPS_DEPLOYMENT_GUIDE.md

# 5. Start with PM2
pm2 start backend/server.js --name meytle
pm2 save
pm2 startup
```

**Complete Guide:** See [`docs/VPS_DEPLOYMENT_GUIDE.md`](docs/VPS_DEPLOYMENT_GUIDE.md)

---

## 🧪 Development

### Prerequisites
- Node.js 22.x or higher
- npm 10.x or higher
- MySQL 8.0 or higher

### Environment Setup
```bash
# Backend .env
NODE_ENV=development
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=meytle_dev
JWT_SECRET=your-secret-key
RESEND_API_KEY=re_xxxxxxxxx

# Frontend .env
VITE_API_URL=http://localhost:5000/api
```

### Development Commands
```bash
# Start backend (auto-creates DB tables)
cd backend
npm run dev

# Start frontend
cd frontend
npm run dev

# Run both concurrently (from root)
npm run dev
```

---

## 🧪 Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# E2E tests (if implemented)
npm run test:e2e
```

---

## 📦 Dependencies

### Backend
- `express` - Web framework
- `mysql2` - MySQL client
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT authentication
- `multer` - File uploads
- `resend` - Email service
- `winston` - Logging
- `helmet` - Security headers
- `cors` - CORS middleware

### Frontend
- `react` - UI library
- `react-router-dom` - Routing
- `axios` - HTTP client
- `react-hot-toast` - Notifications
- `date-fns` - Date utilities
- `leaflet` - Maps (location picker)
- `react-icons` - Icon library

**Full Dependencies:** Check `backend/package.json` and `frontend/package.json`

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Authors

- **Your Name** - Initial work

---

## 🙏 Acknowledgments

- OpenStreetMap for address autocomplete
- Resend for email service
- Tailwind CSS for styling framework
- React community for excellent tools

---

## 📞 Support

For support, email support@meytle.com or open an issue on GitHub.

---

## 🔗 Links

- **Live Site:** https://meytle.com
- **Documentation:** [docs/](docs/)
- **Issues:** [GitHub Issues](https://github.com/YOUR_USERNAME/meytle/issues)

---

**Built with ❤️ using React, Node.js, and MySQL**

---

## 📊 Stats

- **Lines of Code:** ~50,000+
- **Components:** 50+ React components
- **API Endpoints:** 40+ routes
- **Database Tables:** 14 essential tables
- **Documentation:** 25+ detailed guides

---

**Last Updated:** November 7, 2025
