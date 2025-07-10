// app.js handles switching between modules and populating the sidebar and main
// content areas. In a more advanced implementation these would likely be
// separate React components or similar, but for demonstration purposes we
// keep it lightweight with vanilla JavaScript.

// Definitions for each module's sidebar and main content
const modules = {
    messaging: {
        sidebar: ['Inbox', 'Sent', 'Drafts'],
        content: 'Welcome to Messaging. Communicate instantly with coworkers.'
    },
    crm: {
        sidebar: ['Leads', 'Opportunities', 'Accounts'],
        content: 'Manage customer relationships in one place.'
    },
    projects: {
        sidebar: ['Active Projects', 'Teams', 'Reports'],
        content: 'Track project progress and collaborate.'
    },
    timesheets: {
        sidebar: ['Submit Time', 'Review', 'Reports'],
        content: 'Log hours and track billable time.'
    },
    leave: {
        sidebar: ['Request Leave', 'Calendar', 'Approvals'],
        content: 'Manage vacation and leave requests.'
    }
};

const tabs = document.querySelectorAll('#tabs li');
const sidebar = document.getElementById('sidebar');
const main = document.getElementById('main-content');

function renderModule(name) {
    // Update active tab
    tabs.forEach(tab => tab.classList.remove('active'));
    document.querySelector(`#tabs li[data-module="${name}"]`).classList.add('active');

    // Populate sidebar links
    sidebar.innerHTML = '<ul>' + modules[name].sidebar.map(item => `<li>${item}</li>`).join('') + '</ul>';

    // Populate main content
    main.textContent = modules[name].content;
}

// Attach click handlers to each tab
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const moduleName = tab.getAttribute('data-module');
        renderModule(moduleName);
    });
});

// Render default module on initial load
renderModule('messaging');
