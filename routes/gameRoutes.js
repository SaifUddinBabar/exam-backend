import express from "express";
import {
  findMatch,
  createFriendRoom,
  joinFriendRoom,
  getBattle,
  answerQuestion,
  leaveBattle,
  battleHistory,
  currentBattle,
  battleTopics,
  myStats,
} from "../controllers/battleController.js";
import { leaderboard, myLeague, rules } from "../controllers/leagueController.js";
import { dashboard } from "../controllers/studentController.js";
import { protect } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const battleRouter = express.Router();
battleRouter.get("/topics", protect, battleTopics);
battleRouter.get("/history", protect, battleHistory);
battleRouter.get("/current", protect, currentBattle);
battleRouter.get("/me/stats", protect, myStats);
battleRouter.post("/find", protect, rateLimit({ windowMs: 60_000, max: 20, key: "battle-find" }), findMatch);
battleRouter.post("/friend", protect, rateLimit({ windowMs: 60_000, max: 10, key: "battle-friend" }), createFriendRoom);
battleRouter.post("/join", protect, rateLimit({ windowMs: 60_000, max: 20, key: "battle-join" }), joinFriendRoom);
battleRouter.get("/:id", protect, rateLimit({ windowMs: 60_000, max: 120, key: "battle-poll" }), getBattle);
battleRouter.post("/:id/answer", protect, rateLimit({ windowMs: 60_000, max: 60, key: "battle-answer" }), answerQuestion);
battleRouter.post("/:id/leave", protect, leaveBattle);

export const leagueRouter = express.Router();
leagueRouter.get("/rules", protect, rules);
leagueRouter.get("/me", protect, myLeague);
leagueRouter.get("/leaderboard", protect, leaderboard);

export const studentRouter = express.Router();
studentRouter.get("/dashboard", protect, dashboard);
