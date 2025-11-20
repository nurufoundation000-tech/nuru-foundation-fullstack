const prisma = require('../../../../lib/prisma');
const bcrypt = require('bcryptjs');

async function POST(request) {
    try {
        const { email, password, name, role = 'student' } = await request.json();
        
        console.log('📝 REGISTRATION ATTEMPT:', { email, name, role });

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (existingUser) {
            return new Response(JSON.stringify({
                success: false,
                message: 'User already exists with this email'
            }), {
                status: 409,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create new user
        const newUser = await prisma.user.create({
            data: {
                email: email.toLowerCase(),
                password: hashedPassword,
                name,
                role
            }
        });

        // Remove password from response
        const { password: _, ...userWithoutPassword } = newUser;

        return new Response(JSON.stringify({
            success: true,
            message: 'User registered successfully',
            user: userWithoutPassword
        }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('❌ Registration error:', error);
        return new Response(JSON.stringify({
            success: false,
            message: 'Registration failed: ' + error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

module.exports = { POST };