-- CreateTable
CREATE TABLE "course_notes" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "tutorId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_notes_courseId_idx" ON "course_notes"("courseId");

-- CreateIndex
CREATE INDEX "course_notes_tutorId_idx" ON "course_notes"("tutorId");

-- AddForeignKey
ALTER TABLE "course_notes" ADD CONSTRAINT "course_notes_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_notes" ADD CONSTRAINT "course_notes_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
