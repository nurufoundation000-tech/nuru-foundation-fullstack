const prisma = require('../../../../lib/prisma');
const bcrypt = require('bcryptjs');

async function POST(request) {
    try {
        const { email, password } = await request.json();
        
        console.log('🔐 LOGIN ATTEMPT:', { email });

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (!user) {
            return new Response(JSON.stringify({
                success: false,
                message: 'Invalid email or password'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            return new Response(JSON.stringify({
                success: false,
                message: 'Invalid email or password'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Return user data without password
        const { password: _, ...userWithoutPassword } = user;

        return new Response(JSON.stringify({
            success: true,
            user: userWithoutPassword,
            token: `prisma-token-${Date.now()}-${user.id}`
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        return new Response(JSON.stringify({
            success: false,
            message: 'Server error during login'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

module.exports = { POST };