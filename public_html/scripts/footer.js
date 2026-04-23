
function startCourseRotation() {
    const ALL_COURSES = [
        { name: "Computer Packages", icon: "fas fa-desktop" },
        { name: "Programming with Python", icon: "fas fa-laptop-code" },
        { name: "Cybersecurity - L1", icon: "fas fa-shield-alt" },
        { name: "Cybersecurity - L2", icon: "fas fa-lock" },
        { name: "Data Science", icon: "fas fa-chart-bar" },
        { name: "Data Analysis", icon: "fas fa-search-dollar" },
        { name: "Data Engineering", icon: "fas fa-database" },
        { name: "Web Development - L1", icon: "fas fa-html5" },
        { name: "Web Development - L2", icon: "fas fa-code" },
        { name: "Web Development - L3", icon: "fas fa-server" },
        { name: "AI Essentials", icon: "fas fa-robot" },
        { name: "Soft Skills", icon: "fas fa-handshake" }
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
            link.href = "#";
            
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
