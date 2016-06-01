'use strict';
var Answer = require('./models/forumanswer.model.js'),
    Category = require('./models/forumcategory.model.js'),
    Thread = require('./models/forumthread.model.js'),
    UserFunctions = require('../user/user.functions.js'),
    async = require('async'),
    mailer = require('../../components/mailer'),
    config = require('../../res/config.js'),
    _ = require('lodash');


function completeCategory(category, next) {
    async.parallel([
        Answer.count.bind(Answer, {categoryId: category.uuid, main: false}),
        Thread.count.bind(Thread, {categoryId: category.uuid}),
        Thread.findOne.bind(Thread, {categoryId: category.uuid}, null, {sort: {'updatedAt': -1}})
    ], function(err, results) {
        if (err) {
            next(err);
        } else {
            var categoryObject = category.toObject();
            categoryObject.numberOfAnswers = results[0];
            categoryObject.numberOfThreads = results[1];
            categoryObject.lastThread = results[2];
            if (categoryObject.lastThread) {
                completeWithUserName(categoryObject.lastThread, function(err, threadObject) {
                    if (err) {
                        next(err);
                    } else {
                        categoryObject.lastThread = threadObject;
                        next(null, categoryObject);
                    }
                });
            } else {
                next(null, categoryObject);
            }

        }
    });
}


function countAnswersThread(thread, next) {
    Answer.count({threadId: thread._id, main: false}, function(err, counter) {
        if (err) {
            next(err);
        } else {
            var threadObject = thread.toObject();
            threadObject.numberOfAnswers = counter;
            next(null, threadObject);
        }
    });
}

function getThreadsInCategory(category, next) {
    Thread.find({categoryId: category.uuid}).sort('-updatedAt').exec(function(err, threads) {
        if (err) {
            next(err);
        } else {
            async.map(threads, function(thread, callback) {
                async.parallel([
                    countAnswersThread.bind(null, thread),
                    completeWithUserName.bind(null, thread),
                    Answer.findOne.bind(Answer, {threadId: thread._id}, null, {sort: {'updatedAt': -1}})
                ], function(err, results) {
                    if (results) {
                        var thread = _.extend(results[0], results[1]);
                        completeWithUserName(results[2], function(err, completedAnswer) {
                            thread.lastAnswer = completedAnswer;
                            callback(err, thread);
                        });
                    } else {
                        callback(err, []);
                    }
                });
            }, function(err, completedThreads) {
                next(err, {category: category, threads: completedThreads});
            })
        }
    });
}

function completeWithUserName(collection, next) {
    UserFunctions.getUserProfile(collection.creatorId, function(err, user) {
        var object;
        if (user) {
            object = collection.toObject();
            object.creatorUsername = user.username;
        }
        next(err, object);
    });
}

function getCompletedThread(id, next) {
    async.waterfall([
        Thread.findById.bind(Thread, id),
        completeWithUserName
    ], next);
}

function getCompletedAnswer(themeId, next) {
    async.waterfall([
        Answer.find.bind(Answer, {threadId: themeId}),
        function(anwers, next) {
            async.map(anwers, completeWithUserName, next);
        }
    ], next);
}


/**
 * Create Category
 */
exports.createCategory = function(req, res) {
    var newCategory = new Category(req.body);
    newCategory.save(function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.sendStatus(200);
        }
    });
};

/**
 * Create Thread
 */
exports.createThread = function(req, res) {

    var userId = req.user._id;

    var newThread = new Thread(req.body.thread),
        newAnswer = new Answer(req.body.answer);

    newThread.creatorId = userId;

    async.waterfall([
        newThread.save,
        function(thread, saved, next) {
            newAnswer.threadId = newThread._id;
            newAnswer.categoryId = newThread.categoryId;
            newAnswer.creatorId = userId;
            // Save the answer
            newAnswer.save(next);
        },
        function(answer, saved, next) {
            Category.findOne({uuid: answer.categoryId}, 'name', function(err, category) {
                next(err, answer, category.name);
            })
        }
    ], function(err, answer, categoryName) {
        if (err) {
            res.status(500).send(err);
        } else {
            var locals = {
                email: config.supportEmail,
                subject: 'Nuevo tema en el foro de Bitbloq',
                //username: answer.owner.username,
                forumUrl: config.client_domain + '/#/help/forum/' + encodeURIComponent(categoryName) + '/' + answer.threadId,
                threadTitle: newThread.title,
                threadContent: answer.content
            };

            mailer.sendOne('newForumThread', locals, function(err) {
                if (err) {
                    res.status(500).send(err);
                }
                res.status(200).send(newThread._id);
            });
        }
    });
};

/**
 * Create Answer
 */
exports.createAnswer = function(req, res) {
    var userId = req.user._id;

    async.waterfall([
        Thread.findByIdAndUpdate.bind(Thread, req.body.threadId, {'updatedAt': Date.now()}),
        function(thread, next) {
            var newAnswer = new Answer(req.body);
            newAnswer.categoryId = thread.categoryId;
            newAnswer.creatorId = userId;
            newAnswer.save(next)
        },
        function(answer, saved, next) {
            Category.findOne({uuid: answer.categoryId}, 'name', function(err, category) {
                next(err, answer, category.name);
            })
        },
        function(answer, categoryName, next) {
            Thread.findById(req.body.threadId, function(err, thread) {
                next(err, answer, thread, categoryName);
            })
        }

    ], function(err, answer, thread, categoryName) {
        if (err) {
            res.status(500).send(err);
        } else {
            var locals = {
                email: config.supportEmail,
                subject: 'Nueva respuesta en el foro de Bitbloq',
                // username: answer.owner.username,
                forumUrl: config.client_domain + '/#/help/forum/' + encodeURIComponent(categoryName) + '/' + answer.threadId,
                answerTitle: thread.title,
                answerContent: answer.content
            };

            mailer.sendOne('newForumAnswer', locals, function(err) {
                if (err) {
                    res.status(500).send(err);
                }
                res.status(200).send(answer._id);
            });
        }
    });
};


/**
 * Gets Main forum section
 */
exports.getForumIndex = function(req, res) {
    Category.find({}, function(err, categories) {
        if (err) {
            res.status(500).send(err);
        } else {
            async.map(categories, completeCategory, function(err, mainForumCategories) {
                if (err) {
                    res.status(500).send(err);
                } else {
                    res.status(200).json(mainForumCategories);
                }
            });
        }
    });
};


/**
 * Get info category and all threads in a category
 */
exports.getCategory = function(req, res) {
    var categoryName = req.params.category;
    async.waterfall([
        Category.findOne.bind(Category, {name: categoryName}),
        getThreadsInCategory
    ], function(err, completedCategory) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.status(200).json(completedCategory);
        }
    });
};

/**
 * Get a single thread by Id
 */
exports.getThread = function(req, res) {
    var themeId = req.params.id;

    async.parallel([
        getCompletedThread.bind(null, themeId),
        getCompletedAnswer.bind(null, themeId)
    ], function(err, results) {
        if (err) {
            res.status(500).send(err);
        } else {
            var threadObject = results[0];
            threadObject.numberOfAnswers = results[1].length - 1;
            if (req.user && threadObject.creatorId != req.user._id) {
                var thread = new Thread(threadObject);
                thread.addView();
                Thread.findByIdAndUpdate(thread._id, thread, function(err, thread) {
                    if (err) {
                        res.status(500).send(err);
                    } else {
                        res.status(200).json({thread: thread, answers: results[1]});
                    }
                });
            } else {
                res.status(200).json({thread: threadObject, answers: results[1]});
            }
        }
    });
};

/**
 * Update a thread
 */
exports.updateThread = function(req, res) {
    var threadId = req.params.id;
    var threadData = req.body;
    Thread.findByIdAndUpdate(threadId, threadData, function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.sendStatus(200);
        }
    });
};

/**
 * Update thread views
 */
exports.updateThreadViews = function(req, res) {
    var threadId = req.params.id;
    Thread.findByIdAndUpdateAsync(threadId, {
        $inc: {
            numberOfViews: 1
        }
    }, function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.sendStatus(200);
        }
    });
};

/**
 * Update an answer
 */
exports.updateAnswer = function(req, res) {
    var answerId = req.params.id;
    Answer.findById(answerId, function(err, answer) {
        if (err) {
            res.status(500).send(err);
        } else {
            if (answer.isOwner(req.user._id)) {
                answer = _.extend(answer, req.body);
                answer.save(function(err) {
                    if (err) {
                        res.status(500).send(err);
                    } else {
                        res.sendStatus(200);
                    }
                });
            } else {
                res.sendStatus(401);
            }
        }
    });
};

/**
 * Deletes an answer
 */
exports.destroyAnswer = function(req, res) {
    Answer.findByIdAndRemove(req.params.id, function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            //Todo destroy images in answer
            res.sendStatus(200);
        }
    });
};

/**
 * Deletes a thread
 */
exports.destroyThread = function(req, res) {
    var threadId = req.params.id;
    async.waterfall([
        Answer.remove.bind(Answer, {threadId: threadId}),
        Thread.findByIdAndRemove.bind(Thread, threadId)
    ], function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.sendStatus(200);
        }
    });
};

exports.createAllCategories = function(req, res) {
    Category.collection.insert(req.body, function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.sendStatus(200);
        }
    });
};

exports.deleteAllCategories = function(req, res) {
    Category.remove({}, function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.sendStatus(200);
        }
    });
};
