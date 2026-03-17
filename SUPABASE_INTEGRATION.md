# Digital Transparency Board - Supabase Integration

This document describes the Supabase database integration for the Digital Transparency Board application.

## Overview

The application has been fully integrated with Supabase to provide real-time data persistence for all modules including:
- Student Management
- Event Management
- Payment Records
- Attendance Tracking
- Financial Transparency
- Feedback System

## Setup Instructions

### 1. Create a Supabase Project

1. Go to [Supabase](https://supabase.com) and create a new project
2. Note your project URL and anon key

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Run the Database Schema

Execute the SQL schema (provided by the user) in your Supabase SQL Editor to create all necessary tables:
- `students`
- `events`
- `attendance_records`
- `contribution_records`
- `payment_records`
- `transactions`
- `feedback_items`
- `financial_summaries`
- `event_allocations`

### 4. Install Dependencies

```bash
npm install
```

### 5. Run the Application

```bash
npm run dev
```

## Database Services

All database operations are encapsulated in `/src/services/db.ts`:

### Students Service
- `getAll()` - Fetch all students
- `getById(id)` - Fetch student by UUID
- `getByStudentId(studentId)` - Fetch student by student ID
- `getByName(name)` - Search student by name
- `create(student)` - Create new student
- `update(id, student)` - Update student
- `delete(id)` - Delete student
- `search(query)` - Search students by name or ID

### Events Service
- `getAll()` - Fetch all events
- `getById(id)` - Fetch event by ID
- `create(event)` - Create new event
- `update(id, event)` - Update event
- `delete(id)` - Delete event

### Attendance Service
- `getAll()` - Fetch all attendance records
- `getByStudentId(studentId)` - Fetch attendance by student
- `getByEventId(eventId)` - Fetch attendance by event
- `create(record)` - Create attendance record
- `update(id, record)` - Update attendance
- `delete(id)` - Delete attendance
- `getStatsByEventId(eventId)` - Get attendance statistics

### Contributions Service
- `getAll()` - Fetch all contribution records
- `getByStudentId(studentId)` - Fetch contributions by student
- `getByEventId(eventId)` - Fetch contributions by event
- `create(record)` - Create contribution record
- `update(id, record)` - Update contribution
- `delete(id)` - Delete contribution

### Payments Service
- `getAll()` - Fetch all payment records
- `getByStudentId(studentId)` - Fetch payments by student
- `getByEventId(eventId)` - Fetch payments by event
- `create(record)` - Create payment record
- `update(id, record)` - Update payment
- `delete(id)` - Delete payment

### Transactions Service
- `getAll()` - Fetch all transactions
- `getByEventId(eventId)` - Fetch transactions by event
- `create(record)` - Create transaction
- `update(id, record)` - Update transaction
- `delete(id)` - Delete transaction
- `getFinancialSummary()` - Get financial summary

### Feedback Service
- `getAll()` - Fetch all feedback items
- `getByType(type)` - Fetch feedback by type
- `getByStatus(status)` - Fetch feedback by status
- `create(item)` - Create feedback item
- `update(id, item)` - Update feedback
- `delete(id)` - Delete feedback
- `updateStatus(id, status)` - Update feedback status

### Financial Summary Service
- `get()` - Fetch financial summary
- `update(summary)` - Update financial summary

### Event Allocations Service
- `getAll()` - Fetch all event allocations
- `getByEventId(eventId)` - Fetch allocation by event
- `create(allocation)` - Create event allocation
- `update(eventId, allocation)` - Update event allocation

## UI Updates

All sections have been updated with:
- Loading states while fetching data
- Error handling with toast notifications
- Success confirmations for CRUD operations
- Disabled states during async operations

## Authentication

The admin login uses simple mock authentication:
- Username: `admin`, Password: `admin`
- Username: `superadmin`, Password: `superadmin`

For production, implement proper authentication using Supabase Auth.

## Row Level Security (RLS)

The database schema includes RLS policies for:
- Public read access to all tables (for transparency)
- Service role full access (for backend operations)

## Notes

- All data fetching is done asynchronously with proper loading states
- Error handling is implemented throughout the application
- The existing design and animations have been preserved
- Toast notifications provide user feedback for all operations
