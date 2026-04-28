-- Migration: Add missing columns to existing database
-- Run this SQL in PHPMyAdmin or mysql command line

-- 1. Add is_locked column to users table
ALTER TABLE users ADD COLUMN is_locked BOOLEAN DEFAULT FALSE;

-- 2. Add slug column to courses table
ALTER TABLE courses ADD COLUMN slug VARCHAR(255) UNIQUE;

-- 3. Update existing courses with slugs (based on title)
UPDATE courses SET slug = 'python' WHERE title LIKE '%Python%' AND slug IS NULL LIMIT 1;
UPDATE courses SET slug = 'web-dev-1' WHERE title LIKE '%Web Development 1%' AND slug IS NULL LIMIT 1;
UPDATE courses SET slug = 'web-dev-2' WHERE title LIKE '%Web Development 2%' AND slug IS NULL LIMIT 1;
UPDATE courses SET slug = 'web-dev-3' WHERE title LIKE '%Web Development 3%' AND slug IS NULL LIMIT 1;
UPDATE courses SET slug = 'data-science' WHERE title LIKE '%Data Science%' AND slug IS NULL LIMIT 1;
UPDATE courses SET slug = 'data-engineering' WHERE title LIKE '%Data Engineering%' AND slug IS NULL LIMIT 1;
UPDATE courses SET slug = 'data-analysis' WHERE title LIKE '%Data Analysis%' AND slug IS NULL LIMIT 1;
UPDATE courses SET slug = 'cybersecurity-1' WHERE title LIKE '%Cybersecurity 1%' AND slug IS NULL LIMIT 1;
UPDATE courses SET slug = 'cybersecurity-2' WHERE title LIKE '%Cybersecurity 2%' AND slug IS NULL LIMIT 1;
UPDATE courses SET slug = 'ai-essentials' WHERE title LIKE '%AI Essentials%' AND slug IS NULL LIMIT 1;
UPDATE courses SET slug = 'soft-skills' WHERE title LIKE '%Soft Skills%' AND slug IS NULL LIMIT 1;
UPDATE courses SET slug = 'computer-packages' WHERE title LIKE '%Computer Packages%' AND slug IS NULL LIMIT 1;

-- 4. Verify the changes
SELECT id, title, slug FROM courses;
SELECT id, email, is_locked FROM users LIMIT 5;
