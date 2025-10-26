const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function check() {
  try {
    const roles = await prisma.role.findMany();
    const users = await prisma.user.findMany({ include: { role: true } });

    console.log('Roles:', roles);
    console.log('Users:', users);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

check();
