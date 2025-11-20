const prisma = require('../../../lib/prisma');

async function GET() {
    try {
        const userCount = await prisma.user.count();
        
        return new Response(JSON.stringify({
            success: true,
            message: 'Database connection successful',
            userCount: userCount,
            environment: process.env.NODE_ENV
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('❌ Test route error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            databaseUrl: process.env.DATABASE_URL ? 'Present' : 'Missing'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

module.exports = { GET };