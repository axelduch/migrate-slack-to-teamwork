var $ = require('jquery');

function login (apiKey) {
    return $.post('/auth/teamwork', {
        apiKey: apiKey
    });
}

function importUsers(users) {
    return $.post('/api/import', {
        users: users
    });
}

module.exports = {
    login: login,
    importUsers: importUsers
};
