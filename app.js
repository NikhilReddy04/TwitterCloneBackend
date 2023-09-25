const express = require("express");
const app = express();
app.use(express.json());
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

authenticateToken = async (request, response, next) => {
  let jwtToken;
  let authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "narutouzumaki", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

followingOrNot = async (request, response, next) => {
  let username = request.username;
  let userIdOfFollowerQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
  let userIdOfFollower = await db.get(userIdOfFollowerQuery);
  let userId = userIdOfFollower.user_id;
  let { tweetId } = request.params;
  let getTweetOwnerQuery = `
    SELECT user_id from tweet WHERE tweet_id = ${tweetId}`;
  let tweetOwner = await db.get(getTweetOwnerQuery);
  let followingIdsQuery = `SELECT user.user_id AS user_id FROM follower JOIN user ON 
    follower.following_user_id=user.user_id 
    WHERE follower.follower_user_id = ${userId}`;
  let followingList = await db.all(followingIdsQuery);
  const foundObject = followingList.find(
    (obj) => obj.user_id === tweetOwner.user_id
  );
  if (foundObject) {
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
};

initializeDatabase = async () => {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
  app.listen(3000, () => console.log("Server Running..."));
};

initializeDatabase();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  let userDetails = await db.get(getUserQuery);
  if (userDetails === undefined) {
    if (password.length >= 6) {
      let hashedPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `INSERT INTO user(username,password,name,gender) 
        VALUES('${username}','${hashedPassword}','${name}','${gender}')`;
      await db.run(addUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserDetailsQuery = `SELECT * from user where username = '${username}'`;
  let userDetails = await db.get(getUserDetailsQuery);
  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    let hashedPassword = userDetails.password;
    let comparePassword = await bcrypt.compare(password, hashedPassword);
    if (comparePassword) {
      let payload = { username: username };
      let jwtToken = jwt.sign(payload, "narutouzumaki");
      response.send({ jwtToken });
      response.status(200);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let username = request.username;
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}'`;
  let userIdObj = await db.get(getUserId);
  let userId = userIdObj.user_id;
  const getFeedQuery = `SELECT user.username AS username ,tweet.tweet AS tweet ,tweet.date_time AS dateTime
    FROM user JOIN follower ON follower.following_user_id= user.user_id 
    JOIN tweet ON follower.following_user_id = tweet.user_id WHERE follower.follower_user_id = ${userId} 
    ORDER BY tweet.date_time DESC LIMIT 4`;
  const getFeed = await db.all(getFeedQuery);
  response.status(200);
  response.send(getFeed);
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  let username = request.username;
  const getUserDetailsQuery = `SELECT * FROM user WHERE username='${username}'`;
  let userDetails = await db.get(getUserDetailsQuery);
  const getFollowingQuery = `SELECT user.name AS name FROM follower JOIN user ON 
    follower.following_user_id=user.user_id 
    WHERE follower.follower_user_id = ${userDetails.user_id}`;
  let followingList = await db.all(getFollowingQuery);
  response.send(followingList);
  response.status(200);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let username = request.username;
  const getUserDetailsQuery = `SELECT * FROM user WHERE username='${username}'`;
  let userDetails = await db.get(getUserDetailsQuery);
  const getFollowerQuery = `SELECT user.name AS name FROM follower JOIN user ON 
    follower.follower_user_id=user.user_id 
    WHERE follower.following_user_id = ${userDetails.user_id}`;
  let followerList = await db.all(getFollowerQuery);
  response.send(followerList);
  response.status(200);
});

//API 6
app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  followingOrNot,
  async (request, response) => {
    let { tweetId } = request.params;
    const getLikeCountQuery = `SELECT COUNT(like_id) AS count FROM like WHERE tweet_id = ${tweetId}`;
    let likesCount = await db.get(getLikeCountQuery);
    const getReplyCountQuery = `SELECT COUNT(reply_id) AS count FROM reply WHERE tweet_id = ${tweetId}`;
    let repliesCount = await db.get(getReplyCountQuery);
    const getTweetDetailsQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId}`;
    let tweetDetails = await db.get(getTweetDetailsQuery);
    let responseObj = {
      tweet: tweetDetails.tweet,
      likes: likesCount.count,
      replies: repliesCount.count,
      dateTime: tweetDetails.date_time,
    };
    response.send(responseObj);
    response.status(200);
  }
);

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  followingOrNot,
  async (request, response) => {
    let { tweetId } = request.params;
    const getLikedUsers = `SELECT user.username AS name FROM user JOIN like ON like.user_id = user.user_id
    WHERE like.tweet_id='${tweetId}'`;
    let likedUsers = await db.all(getLikedUsers);
    let likedUsersArray = [];
    for (let element of likedUsers) {
      likedUsersArray.push(element.name);
    }
    let responseObj = {
      likes: likedUsersArray,
    };
    response.send(responseObj);
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  followingOrNot,
  async (request, response) => {
    let { tweetId } = request.params;
    const getNameAndReplyQuery = `SELECT user.name AS name,reply.reply AS reply FROM user
    JOIN reply ON user.user_id = reply.user_id WHERE reply.tweet_id=${tweetId}`;
    let nameAndReply = await db.all(getNameAndReplyQuery);
    let responseBody = {
      replies: nameAndReply,
    };
    response.send(responseBody);
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let username = request.username;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}'`;
  const userDetails = await db.get(getUserDetails);
  let user_id = userDetails.user_id;
  const getTweetsIds = `SELECT tweet_id from tweet WHERE user_id = ${user_id}`;
  const tweetsIds = await db.all(getTweetsIds);
  let tweetIdsArray = [];
  for (let element of tweetsIds) {
    tweetIdsArray.push(element.tweet_id);
  }

  tweetDetailsArray = [];
  for (let tweetId of tweetIdsArray) {
    let getTweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId}`;
    let tweetDetails = await db.get(getTweetQuery);
    const getLikeCountQuery = `SELECT COUNT(like_id) AS count FROM like WHERE tweet_id = ${tweetId}`;
    let likesCount = await db.get(getLikeCountQuery);
    const getReplyCountQuery = `SELECT COUNT(reply_id) AS count FROM reply WHERE tweet_id = ${tweetId}`;
    let repliesCount = await db.get(getReplyCountQuery);
    let responseObj = {
      tweet: tweetDetails.tweet,
      likes: likesCount.count,
      replies: repliesCount.count,
      dateTime: tweetDetails.date_time,
    };
    tweetDetailsArray.push(responseObj);
  }
  response.send(tweetDetailsArray);
  response.status(200);
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { tweet } = request.body;
  let username = request.username;
  const getUserID = `SELECT user_id FROM user WHERE username='${username}'`;
  let userIdObj = await db.get(getUserID);
  let userId = userIdObj.user_id;
  let dateTime = new Date();
  const addTweetQuery = `INSERT INTO tweet(tweet,user_id,date_time)
        VALUES('${tweet}',${userId},'${dateTime}')`;
  await db.run(addTweetQuery);
  response.status(200);
  response.send("Created a Tweet");
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { tweetId } = request.params;
    let username = request.username;
    const getUserId = `SELECT user_id FROM user WHERE username='${username}'`;
    let userId = await db.get(getUserId);
    const getTweetOwnerId = `SELECT user_id FROM tweet WHERE tweet_id =${tweetId}`;
    let tweetOwnerId = await db.get(getTweetOwnerId);
    if (userId.user_id === tweetOwnerId.user_id) {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id =${tweetId}`;
      await db.run(deleteTweetQuery);
      response.status(200);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
