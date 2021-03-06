var express = require('express');
var router = express.Router();
var ensureSlackAuthenticated = require('../middlewares/ensure_slack_authenticated');
var ensureTeamworkAuthenticated = require('../middlewares/ensure_teamwork_authenticated');
var slackRequestPromise = require('../utils/slack_request_promise');
var teamworkRequestPromise = require('../utils/teamwork_request_promise');
var Promise = require('bluebird');
var Queue = require('bluebird-queue');
var twConfig = require('../config').teamworkProjects;
var computeImportableUsers = require('../utils/compute_importable_users');

router.use(ensureTeamworkAuthenticated);
router.use(ensureSlackAuthenticated);

router.get('/importable-slack-users', function (req, res) {
    var user = req.user;
    var teamworkApiKey = user.teamworkApiKey;
    var userSite = user.teamworkUserSite;
    var slackUsers;

    slackRequestPromise({
        apiMethod: 'users.list',
        credentials: user.accessToken
    }).then(function (data) {
        if (!data.ok) {
            return Promise.reject();
        }

        var mySlackUser = data.members.filter(me)[0];
        slackUsers = data.members.filter(notMe)
                                .filter(notBot)
                                .filter(hasEmail);

        user.slackProfile = mySlackUser;

        return teamworkRequestPromise({
            apiMethod: 'people',
            '?': {
                pageSize: 1000
            },
            userSite: userSite,
            credentials: teamworkApiKey
        });
    }).then(function (data) {
        if (data.STATUS !== 'OK') {
            return Promise.reject();
        }

        var teamworkUsers = data.people;
        var users = computeImportableUsers(slackUsers, teamworkUsers);

        res.send(users);
    }).catch(function () {
        res.status(500).send({ error: 'Sorry something went wrong!' });
    });

    function me (member) {
        return member.id === user.id;
    }

    function hasEmail (member) {
        return member.profile.email;
    }

    function notMe (member) {
        return !me(member);
    }


    function notBot (member) {
        return !member.is_bot;
    }
});


router.post('/import',  function (req, res) {
    var mainUserProfile = req.user.slackProfile;
    var users = req.body.users || [];
    var userSite = req.user.teamworkUserSite;
    var credentials = req.user.teamworkApiKey;
    var queue = new Queue();

    var users = prepareUsers(mainUserProfile, users);
    var importPromises = users.map(function (user) {
        return importUserPromise(user, userSite, credentials);
    });

    queue.add(importPromises);
    queue.start()
        .then(function () {
            res.send(true);
        }).catch(function () {
            res.send(false);
        });
});


function prepareUsers(mainUserProfile, users) {
    return users.map(function (user) {
        return prepareUser(mainUserProfile, user);
    });
}


function prepareUser(mainUserProfile, user) {
    prefillFields(user);
    copySharedFields(mainUserProfile, user);

    return user;
}


function prefillFields(user) {
    user.administrator = 'no';
    user['user-type'] = 'account';
}


function copySharedFields(me, user) {
    var companyId = me['company-id'];

    if (companyId) {
        user['company-id'] = companyId;
    }
}


function importUserPromise (user, userSite, credentials) {
    return teamworkRequestPromise({
        apiMethod: 'people',
        httpMethod: 'POST',
        userSite: userSite,
        credentials: credentials,
        data: { person: user }
    });
}


module.exports = router;
