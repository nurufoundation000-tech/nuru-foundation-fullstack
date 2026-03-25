const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma');
const { verifyToken } = require('../lib/jwt');
const { COURSE_SLUGS, SLUG_TO_COURSE } = require('../lib/courseSlugs');

router.get('/check', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const token = authHeader.slice(7);
        const decoded = verifyToken(token);
        
        const { course } = req.query;
        if (!course) {
            return res.status(400).json({ error: 'Course slug required' });
        }

        const courseData = COURSE_SLUGS[course];
        if (!courseData) {
            return res.status(404).json({ error: 'Course not found' });
        }

        const enrollment = await prisma.enrollment.findUnique({
            where: {
                studentId_courseId: {
                    studentId: decoded.userId,
                    courseId: courseData.courseId
                }
            }
        });

        if (!enrollment) {
            return res.status(403).json({ error: 'Not enrolled in this course' });
        }

        const courseWithDetails = await prisma.course.findUnique({
            where: { id: courseData.courseId },
            include: {
                lessons: {
                    orderBy: { orderIndex: 'asc' },
                    select: { id: true, title: true }
                },
                _count: {
                    select: { lessons: true }
                }
            }
        });

        res.json({
            success: true,
            enrolled: true,
            course: {
                id: courseData.courseId,
                slug: course,
                name: courseData.name,
                category: courseData.category,
                lessonCount: courseWithDetails?._count.lessons || 3,
                lessons: courseWithDetails?.lessons || []
            }
        });

    } catch (error) {
        console.error('Notes check error:', error);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        res.status(500).json({ error: 'Failed to check enrollment' });
    }
});

router.get('/my-courses', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const token = authHeader.slice(7);
        const decoded = verifyToken(token);

        const enrollments = await prisma.enrollment.findMany({
            where: { studentId: decoded.userId },
            include: {
                course: {
                    select: { id: true, title: true, category: true }
                }
            }
        });

        const courses = enrollments.map(enrollment => {
            const slug = SLUG_TO_COURSE[enrollment.course.id];
            return {
                ...enrollment.course,
                slug,
                enrolledAt: enrollment.enrolledAt,
                progress: enrollment.progress
            };
        });

        res.json({
            success: true,
            courses
        });

    } catch (error) {
        console.error('My courses error:', error);
        res.status(500).json({ error: 'Failed to fetch courses' });
    }
});

module.exports = router;
