# Skinzy-AI-Skin-Analysis
## 1). Project Description

SKINZY is an AI-powered personalized skincare recommendation system designed to analyze user skin conditions and provide customized skincare solutions. The system uses quiz responses and AI-based skin photo analysis to identify skin type, skin concerns, and recommend personalized remedies, skincare routines, and dermatologist consultation options.

The project aims to help users choose suitable skincare approaches based on their individual skin profile instead of relying on generic skincare advice.

## 2). Technology Stack and Tools Used
# Frontend
React.js
Vite
React Router
Framer Motion
CSS
# Backend
Node.js
Express.js
# Database
MySQL
# Authentication & Security
JWT (JSON Web Token)
bcrypt
# AI Integration
Google Gemini AI API
# Other Tools & Libraries
Multer (Image Upload)
Nodemailer (Email Service)
mysql2
dotenv
CSV datasets for skincare products and remedies

## 3). Features and Functionalities Implemented
# 1. User Authentication System
User Signup
User Login
JWT-based authentication
Password hashing using bcrypt
Protected routes

# 2. Quiz-Based Skin Analysis
User answers skincare-related questions
System identifies:
Skin type
Main skin concerns
Skin needs
Ingredient compatibility

# 3. AI Skin Photo Analysis
User uploads facial image
Gemini AI analyzes skin conditions
AI generates personalized skincare insights

# 4 . Personalized Recommendation System
The system provides:
Natural/Ayurvedic remedies
Product-based skincare routines
Dermatologist recommendations

# 5. Dashboard System
Personalized skincare dashboard
Skin health score
Daily skincare checklist
Progress tracking
Personalized coach tips

# 6. Routine Management
Morning & Night routines
Remedy tracking
Checklist completion
Progress monitoring

# 7. Reminder System
Daily skincare reminders
Morning and night routine notifications

# 8. Re-Analysis Feature
User can scan skin again
AI updates skincare recommendations dynamically

## 4). Installation / Execution Steps to Run the Project
# Prerequisites
Install the following software:
1) Node.js and npm
2) MySQL Server
3) Visual Studio Code
4) Git

# Backend Setup (VS Code)
1) Open the backend project in VS Code.
2) Navigate to backend directory(Terminal):
   "cd backend"
3) Install backend dependencies:
   "npm install"
4) Configure MySQL database in db.js:
   "host: "localhost",
    user: "root",
    password: "YOUR_PASSWORD",
    database: "skinzy"
5) Create .env file inside backend folder:
    PORT=5000
    JWT_SECRET=your_secret_key
    GEMINI_API_KEY=your_gemini_api_key
6) Run the backend server:
    Windows/Linux/Mac:
    node server.js or npm start

# Database Setup (MySQL)
1) Open MySQL Workbench or XAMPP MySQL.
2) Create database:
     "CREATE DATABASE skinzy;"
3) Import SQL tables if SQL file is provided.

# Frontend Setup (VS Code)
1) Open frontend project in VS Code.
2) Navigate to frontend directory:
   "cd frontend"
3) Install frontend dependencies:
   "npm install"
4) Start frontend:
   "npm run dev"
5) Frontend connects to:
   "http://localhost:5173"

# Backend API Runs On
   "http://localhost:5000"
# Required Backend Packages
   "npm install express mysql2 cors dotenv bcrypt jsonwebtoken multer nodemailer @google/generative-ai"
# Required Frontend Packages
   "npm install react-router-dom framer-motion lucide-react"
  
