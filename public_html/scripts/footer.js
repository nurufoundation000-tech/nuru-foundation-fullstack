
function startCourseRotation() {
    const ALL_COURSES = [
        { name: "Computer Packages", icon: "fas fa-desktop", link: "/courses/computer-packages.html" },
        { name: "Programming with Python", icon: "fas fa-laptop-code", link: "/courses/programming-with-python.html" },
        { name: "Cybersecurity - L1", icon: "fas fa-shield-alt", link: "/courses/cybersecurity-l1.html" },
        { name: "Cybersecurity - L2", icon: "fas fa-lock", link: "/courses/cybersecurity-l2.html" },
        { name: "Data Science", icon: "fas fa-chart-bar", link: "/courses/data-science.html" },
        { name: "Data Analysis", icon: "fas fa-search-dollar", link: "/courses/data-analysis.html" },
        { name: "Data Engineering", icon: "fas fa-database", link: "/courses/data-engineering.html" },
        { name: "Web Development - L1", icon: "fas fa-html5", link: "/courses/web-development-l1.html" },
        { name: "Web Development - L2", icon: "fas fa-code", link: "/courses/web-development-l2.html" },
        { name: "Web Development - L3", icon: "fas fa-server", link: "/courses/web-development-l3.html" },
        { name: "AI Essentials", icon: "fas fa-robot", link: "/courses/ai-essentials.html" },
        { name: "Soft Skills", icon: "fas fa-handshake", link: "/courses/softskills.html" }
    ];

    const COURSE_DISPLAY_LIMIT = 5; 
    const ROTATION_INTERVAL = 5000; 
    let startIndex = 0; 


    const coursesListElement = document.getElementById('rotating-courses');


    if (!coursesListElement) {
        console.error("The 'rotating-courses' element was not found. Rotation will not start.");
        return; 
    }


    function renderCourses() {
  
        coursesListElement.innerHTML = '';

   
        for (let i = 0; i < COURSE_DISPLAY_LIMIT; i++) {
            const courseIndex = (startIndex + i) % ALL_COURSES.length;
            const course = ALL_COURSES[courseIndex];

            const listItem = document.createElement('li');
            const link = document.createElement('a');
            link.href = course.link;
            
            const icon = document.createElement('i');
            icon.className = course.icon;
            
            link.appendChild(icon);
            link.appendChild(document.createTextNode(` ${course.name}`));
            
            listItem.appendChild(link);
            listItem.classList.add('course-fade-in');

            coursesListElement.appendChild(listItem);
        }

       
        startIndex = (startIndex + 1) % ALL_COURSES.length;
    }

 
    renderCourses();

   
    setInterval(renderCourses, ROTATION_INTERVAL);
}
