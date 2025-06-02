// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Register the datalabels plugin globally BEFORE any chart instances are created.
Chart.register(ChartDataLabels);

// === TOGGLE FOR DATALABELS FORMATTING ===
// Set this to `true` to show percentages on pie/doughnut charts,
// and `false` to show actual numbers on all charts.
let showPercentageOnPieDoughnut = false;
// =======================================

// YOUR FIREBASE CONFIGURATION - THIS HAS BEEN UPDATED WITH YOUR PROVIDED VALUES
// This is crucial for connecting to YOUR Firebase project.
const firebaseConfig = {
  apiKey: "AIzaSyAAg8GvVibxf1JeCzxsGuZXZhHRx1fRFzk",
  authDomain: "iqra-academy-dashboard-backend.firebaseapp.com",
  projectId: "iqra-academy-dashboard-backend",
  storageBucket: "iqra-academy-dashboard-backend.firebasestorage.app",
  messagingSenderId: "297544551827",
  appId: "1:297544551827:web:aced8762aef12495d42c66",
  measurementId: "G-HH530TRWPF"
};

// Firebase Initialization
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
let currentUserId = null; // To store the authenticated user ID
let dataOwnerId = null; // To store the ID of the user who can upload data (from __initial_auth_token)

// Use a consistent app ID for the Firestore path on GitHub Pages.
// This should be a unique string for your public dashboard.
const githubAppId = "iqra-dashboard-public";
const studentDataDocRef = doc(db, `artifacts/${githubAppId}/public/data/student_data/main_data`); // Public data path

// DOM Elements for messages and loading
const appMessageDiv = document.getElementById('appMessage');
const loadingIndicator = document.getElementById('loadingIndicator');
const uploadSection = document.getElementById('uploadSection'); // Get the upload section element
const csvFileInput = document.getElementById('csvFileInput');
const loadCsvButton = document.getElementById('loadCsvButton');
const userIdDisplay = document.getElementById('userIdDisplay'); // Get the user ID display element

// Initial sample data for immediate display if no data is in Firestore or uploaded yet.
let currentRawData = `LEVEL,TEACHER,GENDER,NAME,PARENTS NAME,CONTACT INFO,RN,Department
2,MD Abdur Rashid,BOYS,Mohammed I. Khan,M. HERON KHAN,313 455 1008,1,WEEKEND
2,MD Abdur Rashid,BOYS,Nazmul Shaheen,KAMRUL SHAHEEN,586 303 6606,2,WEEKEND
2,MD Abdur Rashid,BOYS,Maaz Usman,USMAN AHMED,313 661 9890,3,WEEKEND
3,Numaan Chowdhury,BOYS,Mohd. Ahad Abid,ABDUL AHAD,586 354 5713,1,WEEKEND
4,Hafij Badruzzaman,GIRLS,Sabiha Rahman,WALIUR RAHMAN,313 598 6417,1,WEEKEND
1A,Wahidur M Rahman,BOYS,Radeen Noor,ROMAN NOOR,313 615 6654,1,WEEKEND
1B,Adannan Chowdhury,GIRLS,Farhan Uddin,JAMAL UDDIN,313 443 6329,1,WEEKEND
1C,Tahmidur R Kawsar,BOYS,Adyan Islam,FAKHRUL ISLAM,313 603 1532,1,WEEKEND
2,Raesa Chowdhury,GIRLS,Humaira Kazi,KAZI SHAYEK MIAH,313 312 3781,1,WEEKEND
3,Asma Alsarrah,GIRLS,Abia Mahreen,KOYES AHMED,313 685 2777,1,WEEKEND
4,Fairoz Alsaidi,GIRLS,Farihah Islam,KAMRUL ISLAM,313 303 6660,2,WEEKEND
1A,Umaiza Hussain,GIRLS,Zeemal Tahir,MOHD. TAHIR,248 361 8881,1,WEEKEND
1B,Fahmidah Aniqa,GIRLS,Samiha Ahmed,MOHD. SUHEL AHMED,313 240 2881,1,WEEKEND
1C,Habiba Islam,GIRLS,Manha Bint Ali,M. SHAJAHAN ALI,404 665 6720,1,WEEKEND
0,Data unavailable,BOYS,ARSHAN SUBHAN,NAZMIN SUBHAN,818 918 1527,0,EVENING
0,Data unavailable,GIRLS,MAIMUNA MARIYAM,ABUL ALA CHY,313 603 2039,0,0
`;

let studentsData = []; // Global variable to hold parsed student data
let familyGroupingsData = []; // Global variable for family data

/**
 * Displays a message to the user.
 * @param {string} message - The message to display.
 * @param {string} type - The type of message (e.g., 'green', 'red', 'orange').
 */
function displayMessage(message, type = 'gray') {
    if (appMessageDiv) {
        appMessageDiv.textContent = message;
        appMessageDiv.className = `text-sm mt-2 md:mt-0 text-${type}-600`;
    }
}

/**
 * Shows or hides the loading indicator.
 * @param {boolean} show - True to show, false to hide.
 */
function showLoading(show) {
    if (loadingIndicator) {
        if (show) {
            loadingIndicator.classList.remove('hidden');
        } else {
            loadingIndicator.classList.add('hidden');
        }
    }
}

/**
 * Updates the visibility and enabled state of the upload controls.
 */
function updateUploadControls() {
    if (uploadSection) { // Ensure the upload section exists
        if (currentUserId && dataOwnerId && currentUserId === dataOwnerId) {
            // Current user is the owner, show the upload section
            uploadSection.classList.remove('hidden');
            displayMessage('You are signed in as the data owner. You can upload new data.', 'green');
        } else {
            // Current user is not the owner, hide the upload section
            uploadSection.classList.add('hidden');
            displayMessage('You are viewing the dashboard. Only the owner can upload files.', 'gray');
        }
    }
}

/**
 * Parses CSV student data to extract relevant fields.
 * This function expects the first line of the rawData to be a header row.
 * @param {string} rawData - The raw CSV text data containing student information.
 * @returns {Array<Object>} An array of student objects with parsed fields.
 */
function parseStudentData(rawData) {
    const lines = rawData.trim().split('\n');
    if (lines.length === 0) {
        console.warn("No data found in rawData.");
        return [];
    }

    // Regex to split CSV line, handling quoted fields with commas and escaped quotes
    // It captures either a quoted string (group 1) or a non-quoted string (group 2)
    const csvRegex = /(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|([^,]*))(?:,|$)/g;

    // Extract headers from the first line and clean them
    const headerLine = lines[0];
    let headerMatch;
    const headers = [];
    csvRegex.lastIndex = 0; // Reset regex lastIndex for header line
    while ((headerMatch = csvRegex.exec(headerLine)) !== null) {
        // Group 1 is for quoted, Group 2 is for non-quoted
        let headerValue = headerMatch[1] !== undefined ? headerMatch[1] : headerMatch[2];
        headers.push(headerValue.trim().replace(/""/g, '"')); // Unescape double quotes
    }
    console.log("Parsed Headers:", headers);

    // Define expected headers for validation and mapping
    const expectedHeaders = ['LEVEL', 'TEACHER', 'GENDER', 'NAME', 'PARENTS NAME', 'CONTACT INFO', 'RN', 'Department'];

    const missingHeaders = expectedHeaders.filter(header => !headers.includes(header));
    if (missingHeaders.length > 0) {
        console.error(`Missing expected headers: ${missingHeaders.join(', ')}. Please ensure your CSV has these columns.`);
        displayMessage(`CSV Error: Missing columns - ${missingHeaders.join(', ')}.`, 'red');
        return [];
    }

    const students = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') continue;

        let match;
        const values = [];
        let lastIndex = 0;
        csvRegex.lastIndex = 0; // Reset regex lastIndex for each new line

        while ((match = csvRegex.exec(line)) !== null) {
            // If the match is not at the expected position, it indicates a parsing issue
            if (match.index > lastIndex) {
                console.warn(`Malformed CSV line (gap or uncaptured text between fields): ${line}`);
                // This line is likely malformed, skip further processing for it
                values.length = 0; // Clear values to ensure this line is skipped
                break;
            }

            let value = match[1] !== undefined ? match[1] : match[2];
            values.push(value.trim().replace(/""/g, '"')); // Unescape double quotes
            lastIndex = csvRegex.lastIndex;

            // Break if we've processed the entire line or reached the end
            if (lastIndex === line.length) break;
        }

        if (values.length !== headers.length) {
            console.warn(`Skipping malformed line (column count mismatch or parsing error): ${line}`);
            continue;
        }

        const student = {};
        for (let j = 0; j < headers.length; j++) {
            const header = headers[j];
            student[header] = values[j];
        }

        // Normalize data for consistency
        const normalizedDepartment = student['Department'] ? student['Department'].trim().toUpperCase() : '';
        const normalizedLevel = student.LEVEL ? student.LEVEL.trim().toUpperCase() : '';
        const normalizedGender = student.GENDER ? student.GENDER.trim().toUpperCase() : '';
        const normalizedParentName = student['PARENTS NAME'] ? student['PARENTS NAME'].trim().toUpperCase() : '';

        if (normalizedLevel && student.TEACHER && normalizedGender && normalizedParentName) {
            students.push({
                id: i, // Assign a simple ID for table display
                level: normalizedLevel,
                teacher: student.TEACHER,
                gender: (normalizedGender === 'BOYS' || normalizedGender === 'MALE') ? 'BOYS' : ((normalizedGender === 'GIRLS' || normalizedGender === 'FEMALE') ? 'GIRLS' : 'UNKNOWN'),
                name: student.NAME || '',
                parentsName: normalizedParentName,
                contactInfo: student['CONTACT INFO'] || '',
                rn: student.RN || '',
                department: (normalizedDepartment !== '0') ? normalizedDepartment : ''
            });
        } else {
            console.warn("Skipping line due to missing core data (LEVEL, TEACHER, GENDER, or PARENTS NAME):", student);
        }
    }
    console.log("Total Parsed Students:", students.length);
    return students;
}

// Chart instances storage
let genderChartInstance, departmentChartInstance, levelGenderChartInstance, regularIrregularChartInstance;

/**
 * Renders all charts and updates summary cards based on the provided student data.
 * @param {Array<Object>} studentsData - The array of parsed student objects.
 */
function renderDashboard(studentsData) {
    // Calculate summary metrics
    const totalStudentsCount = studentsData.length;
    let maleStudentsCount = 0;
    let femaleStudentsCount = 0;
    let weekendProgramCount = 0;
    let irregularStudentsCount = 0;

    const levelDistribution = {};
    const levelGenderDistribution = {};
    const departmentDistribution = {};
    const genderDistribution = { BOYS: 0, GIRLS: 0 };
    const familyGroups = {}; // For family groupings and top parents

    studentsData.forEach(student => {
        // Gender counts
        if (student.gender === 'BOYS') {
            maleStudentsCount++;
            genderDistribution['BOYS']++;
        } else if (student.gender === 'GIRLS') {
            femaleStudentsCount++;
            genderDistribution['GIRLS']++;
        }

        // Program/Department counts
        if (student.department === 'WEEKEND') {
            weekendProgramCount++;
        }
        if (student.department && student.department !== '') {
            departmentDistribution[student.department] = (departmentDistribution[student.department] || 0) + 1;
        }

        // Level distribution (still calculated for insight text)
        levelDistribution[student.level] = (levelDistribution[student.level] || 0) + 1;

        // Level by Gender
        if (!levelGenderDistribution[student.level]) {
            levelGenderDistribution[student.level] = { BOYS: 0, GIRLS: 0 };
        }
        if (student.gender === 'BOYS') {
            levelGenderDistribution[student.level]['BOYS']++;
        } else if (student.gender === 'GIRLS') {
            levelGenderDistribution[student.level]['GIRLS']++;
        }

        // Irregular students
        const rnValue = String(student.rn).trim(); // Ensure RN is treated as string for comparison
        if (rnValue === '' || rnValue === '0' || rnValue.toLowerCase() === 'data unavailable') {
            irregularStudentsCount++;
        }

        // Family Groupings
        // Only process if parentsName is not empty, '0', or 'data unavailable'
        if (student.parentsName && student.parentsName !== '0' && student.parentsName.toLowerCase() !== 'data unavailable') {
            if (!familyGroups[student.parentsName]) {
                familyGroups[student.parentsName] = {
                    contactInfo: student.contactInfo,
                    children: [],
                    boys: 0,
                    girls: 0
                };
            }
            familyGroups[student.parentsName].children.push({ name: student.name, gender: student.gender });
            if (student.gender === 'BOYS') {
                familyGroups[student.parentsName].boys++;
            } else if (student.gender === 'GIRLS') {
                familyGroups[student.parentsName].girls++;
            }
        }
    });

    // Convert familyGroups object to an array for easier sorting and display
    familyGroupingsData = Object.keys(familyGroups).map(parentName => ({
        parentName: parentName,
        contactInfo: familyGroups[parentName].contactInfo,
        childrenCount: familyGroups[parentName].children.length,
        genderMix: `${familyGroups[parentName].boys} Boys, ${familyGroups[parentName].girls} Girls`
    })).sort((a, b) => b.childrenCount - a.childrenCount); // Sort by children count descending


    // Update Summary Cards
    document.getElementById('totalStudents').textContent = totalStudentsCount;
    document.getElementById('maleStudents').textContent = maleStudentsCount;
    document.getElementById('femaleStudents').textContent = femaleStudentsCount;
    document.getElementById('weekendProgram').textContent = weekendProgramCount;
    document.getElementById('irregularStudents').textContent = irregularStudentsCount; 

    // Prepare data for Regular vs. Irregular Chart
    const regularStudentsCount = totalStudentsCount - irregularStudentsCount;
    const regularIrregularLabels = ['Regular Students', 'Irregular Students'];
    const regularIrregularData = [regularStudentsCount, irregularStudentsCount];

    // Helper function to create chart options with datalabels
    function getChartOptions(titleText, pluginsOptions = {}, scalesOptions = {}) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: titleText ? true : false,
                    text: titleText
                },
                datalabels: {
                    color: '#fff',
                    font: {
                        weight: 'bold'
                    },
                    formatter: (value, context) => {
                        if (showPercentageOnPieDoughnut && (context.chart.config.type === 'pie' || context.chart.config.type === 'doughnut')) {
                            const sum = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = (sum > 0) ? (value * 100 / sum).toFixed(1) + '%' : '0%';
                            return percentage;
                        }
                        return value;
                    }
                },
                ...pluginsOptions
            },
            scales: scalesOptions
        };
    }

    // Destroy existing chart instances before creating new ones to prevent memory leaks and conflicts
    if (genderChartInstance) genderChartInstance.destroy();
    if (departmentChartInstance) departmentChartInstance.destroy();
    if (levelGenderChartInstance) levelGenderChartInstance.destroy();
    if (regularIrregularChartInstance) regularIrregularChartInstance.destroy();

    // Gender Distribution Chart
    const genderCtx = document.getElementById('genderChart').getContext('2d');
    genderChartInstance = new Chart(genderCtx, {
        type: 'doughnut',
        data: {
            labels: ['Male', 'Female'],
            datasets: [{
                data: [genderDistribution.BOYS, genderDistribution.GIRLS],
                backgroundColor: ['#4F46E5', '#EC4899'],
                borderWidth: 0
            }]
        },
        options: getChartOptions('Gender Distribution', {}, { cutout: '70%' })
    });
    document.getElementById('genderInsight').textContent = `The data shows a gender distribution with ${genderDistribution.BOYS} male and ${genderDistribution.GIRLS} female students.`;


    // Department Distribution Chart (Previously Program Distribution, now explicitly Department)
    const departmentLabels = Object.keys(departmentDistribution).sort();
    const departmentData = departmentLabels.map(label => departmentDistribution[label]);
    const departmentCtx = document.getElementById('departmentChart').getContext('2d');
    departmentChartInstance = new Chart(departmentCtx, {
        type: 'doughnut', // Changed to doughnut for this chart based on previous HTML snippet
        data: {
            labels: departmentLabels,
            datasets: [{
                data: departmentData,
                backgroundColor: ['#F59E0B', '#6366F1', '#10B981', '#EF4444'], // Add more colors if needed
                borderWidth: 0
            }]
        },
        options: getChartOptions('Department Distribution', {}, { cutout: '70%' }) // Added cutout for doughnut
    });
    const totalDepartmentStudents = departmentData.reduce((sum, count) => sum + count, 0);
    const weekendPercentage = totalDepartmentStudents > 0 ? ((departmentDistribution['WEEKEND'] || 0) / totalDepartmentStudents * 100).toFixed(1) : '0';
    document.getElementById('departmentInsight').textContent = `The majority of students (${weekendPercentage}%) are in the Weekend department.`;


    // Level by Gender Chart (Kept as requested, replacing general Level Distribution)
    const levelGenderLabels = Object.keys(levelGenderDistribution).sort((a, b) => {
        const order = ['0', '1A', '1B', '1C', '2', '3', '4'];
        return order.indexOf(a) - order.indexOf(b);
    });
    const levelGenderBoysData = levelGenderLabels.map(label => levelGenderDistribution[label].BOYS || 0);
    const levelGenderGirlsData = levelGenderLabels.map(label => levelGenderDistribution[label].GIRLS || 0);
    const levelGenderCtx = document.getElementById('levelGenderChart').getContext('2d');
    levelGenderChartInstance = new Chart(levelGenderCtx, {
        type: 'bar',
        data: {
            labels: levelGenderLabels,
            datasets: [
                {
                    label: 'Male',
                    data: levelGenderBoysData,
                    backgroundColor: '#4F46E5'
                },
                {
                    label: 'Female',
                    data: levelGenderGirlsData,
                    backgroundColor: '#EC4899'
                }
            ]
        },
        options: getChartOptions(
            'Level Distribution by Gender',
            {},
            {
                x: { stacked: false },
                y: { stacked: false, beginAtZero: true }
            }
        )
    });
    document.getElementById('levelGenderInsight').textContent = `Gender distribution across levels shows variations, with specific levels having more boys or girls.`;

    // Regular vs. Irregular Students Chart (Re-added)
    const regularIrregularCtx = document.getElementById('regularIrregularChart').getContext('2d');
    regularIrregularChartInstance = new Chart(regularIrregularCtx, {
        type: 'doughnut',
        data: {
            labels: regularIrregularLabels,
            datasets: [{
                data: regularIrregularData,
                backgroundColor: [
                    '#22C55E', // Green for Regular
                    '#EF4444'  // Red for Irregular
                ],
                hoverOffset: 4
            }]
        },
        options: getChartOptions('Regular vs. Irregular Students', {}, { cutout: '70%' })
    });
    document.getElementById('regularIrregularInsight').textContent = `There are ${regularStudentsCount} regular students and ${irregularStudentsCount} irregular students.`;

    // Populate Top Parents Section
    const topParentsContainer = document.getElementById('topParentsContainer');
    topParentsContainer.innerHTML = ''; // Clear previous data
    if (familyGroupingsData.length > 0) {
        familyGroupingsData.slice(0, 6).forEach(parent => { // Show top 6 parents
            const parentCard = document.createElement('div');
            parentCard.className = 'bg-indigo-50 rounded-lg p-4 flex items-center';
            parentCard.innerHTML = `
                <div class="bg-indigo-100 p-3 rounded-full mr-4">
                    <i class="fas fa-user-tie text-indigo-600"></i>
                </div>
                <div>
                    <h3 class="font-semibold text-gray-800">${parent.parentName}</h3>
                    <p class="text-sm text-gray-600">${parent.childrenCount} children enrolled</p>
                </div>
            `;
            topParentsContainer.appendChild(parentCard);
        });
        document.getElementById('topParentsInsight').textContent = `Several families have multiple children enrolled, indicating strong family engagement with the institution. The top parent has ${familyGroupingsData[0].childrenCount} children in the program.`;
    } else {
        topParentsContainer.innerHTML = `<div class="bg-gray-50 rounded-lg p-4 text-center text-gray-500 col-span-full">No top parent data available.</div>`;
        document.getElementById('topParentsInsight').textContent = `No top parent data found. Please ensure 'PARENTS NAME' column is present in your CSV and contains valid data.`;
    }


    // Update Key Insights
    document.getElementById('insightGender').textContent = `The institution has ${genderDistribution.BOYS} male and ${genderDistribution.GIRLS} female students.`;
    document.getElementById('insightProgram').textContent = `The Weekend program has ${weekendProgramCount} enrollments, making it the most popular program.`;
    document.getElementById('insightEnrollment').textContent = `There are ${irregularStudentsCount} irregular students, indicating a need to review attendance/registration for these students.`;
    document.getElementById('insightLevel').textContent = `The most common levels are ${Object.keys(levelDistribution).filter(k => levelDistribution[k] === Math.max(...Object.values(levelDistribution))).join(', ')}.`;

    // Update last updated timestamp
    document.getElementById('lastUpdated').textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Saves the provided raw CSV data string to Firestore.
 * @param {string} data - The raw CSV data string to save.
 */
async function saveDataToFirestore(data) {
    showLoading(true);
    displayMessage('Saving data to the cloud...', 'orange');
    try {
        await setDoc(studentDataDocRef, { csvData: data, timestamp: new Date().toISOString() });
        displayMessage('Data saved successfully!', 'green');
    } catch (error) {
        console.error("Error writing document:", error);
        displayMessage('Error saving data. Please try again.', 'red');
    } finally {
        showLoading(false);
    }
}

/**
 * Sets up a real-time listener for student data from Firestore.
 * This function is called after successful authentication.
 */
function setupFirestoreListener() {
    showLoading(true);
    displayMessage('Fetching latest data...', 'gray');
    onSnapshot(studentDataDocRef, (docSnap) => {
        showLoading(false);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data && data.csvData) {
                currentRawData = data.csvData;
                studentsData = parseStudentData(currentRawData);
                if (studentsData.length > 0) {
                    renderDashboard(studentsData); // Render the full dashboard
                    displayMessage('Data updated in real-time!', 'green');
                } else {
                    displayMessage('No valid student data found in the cloud document. Please upload a valid CSV.', 'red');
                    renderDashboard([]); // Render empty dashboard if no valid data
                }
            } else {
                // Document exists but has no csvData, possibly a new document
                displayMessage('No student data found in the cloud. Upload a CSV to get started!', 'orange');
                renderDashboard([]); // Render empty dashboard if no CSV data is found
            }
        } else {
            // Document does not exist, it's the first time
            displayMessage('No student data found in the cloud. Upload a CSV to get started!', 'orange');
            renderDashboard([]); // Render empty dashboard if document doesn't exist
        }
    }, (error) => {
        showLoading(false);
        console.error("Error listening to document:", error);
        displayMessage('Error fetching real-time updates. Check console for details (e.g., Firebase security rules).', 'red');
    });
}

/**
 * Handles Firebase authentication and then sets up the Firestore listener.
 */
async function authenticateAndLoad() {
    showLoading(true);
    displayMessage('Authenticating...', 'gray');

    // This listener is the primary way to react to authentication state changes.
    // It will fire immediately on page load with the current user state (can be null).
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is authenticated
            currentUserId = user.uid;
            userIdDisplay.textContent = currentUserId; // Update the display immediately
            console.log("Authenticated as:", currentUserId);

            // Determine if this session is the 'owner' session.
            // __initial_auth_token is a unique variable provided by the Canvas environment
            // only to the owner's instance.
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                dataOwnerId = user.uid; // If token exists, this user is the owner.
                console.log("Data Owner ID set to current user's UID (Canvas owner session).");
            } else {
                dataOwnerId = null; // Not the Canvas owner's session.
                console.log("Not identified as Canvas owner (no __initial_auth_token).");
            }

            updateUploadControls(); // Update upload controls based on authentication status and owner ID
            setupFirestoreListener(); // Setup listener after auth is confirmed
        } else {
            // No user is currently signed in. Attempt to sign in.
            currentUserId = null;
            dataOwnerId = null; // Reset data owner ID
            userIdDisplay.textContent = 'Not Authenticated'; // Update the display immediately
            console.log("No user authenticated. Attempting sign-in...");

            try {
                // If the __initial_auth_token is available, try to sign in with it (owner).
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    console.log("Attempting signInWithCustomToken...");
                    await signInWithCustomToken(auth, __initial_auth_token);
                    // onAuthStateChanged will fire again with the owner user.
                } else {
                    // Otherwise, sign in anonymously (for public viewers).
                    console.log("Attempting signInAnonymously...");
                    await signInAnonymously(auth);
                    // onAuthStateChanged will fire again with the anonymous user.
                }
            } catch (error) {
                console.error("Authentication attempt failed:", error);
                displayMessage("Authentication failed. Data might not be persistent for this session.", 'red');
                showLoading(false);
                updateUploadControls(); // Hide upload section if auth fails
                renderDashboard([]); // Render empty dashboard if no data can be fetched
            }
        }
    });
}

// Event listener for file input change
if (loadCsvButton) { // Ensure button exists before adding listener
    loadCsvButton.addEventListener('click', () => {
        const file = csvFileInput ? csvFileInput.files[0] : null;

        // Ensure only the owner can trigger this action
        if (!(currentUserId && dataOwnerId && currentUserId === dataOwnerId)) {
            displayMessage('You do not have permission to upload files.', 'red');
            return;
        }

        if (file) {
            if (file.type !== 'text/csv') {
                displayMessage('Please upload a CSV file.', 'red');
                return;
            }

            displayMessage('Reading file...', 'orange');
            showLoading(true);

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const newRawData = e.target.result;
                    const parsedStudents = parseStudentData(newRawData);
                    if (parsedStudents.length > 0) {
                        // Save the new data to Firestore
                        await saveDataToFirestore(newRawData);
                        // The onSnapshot listener will then trigger renderDashboard with the new data
                    } else {
                        displayMessage('No valid student data found in the CSV. Not saving to cloud.', 'red');
                    }
                } catch (error) {
                    console.error("Error processing CSV:", error);
                    displayMessage('Error processing file. Please check console for details.', 'red');
                } finally {
                    showLoading(false);
                }
            };
            reader.onerror = () => {
                displayMessage('Error reading file.', 'red');
                showLoading(false);
            };
            reader.readAsText(file);
        } else {
            displayMessage('Please select a CSV file to upload.', 'red');
        }
    });
}


// Initial render of the dashboard with sample data, then authenticate and load from Firestore
// This ensures the dashboard has some data to display immediately.
studentsData = parseStudentData(currentRawData);
renderDashboard(studentsData);
authenticateAndLoad();
