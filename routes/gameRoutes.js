import express from "express";
import {
  findMatch,
  createFriendRoom,
  joinFriendRoom,
  getBattle,
  answerQuestion,
  streamBattle,
  leaveBattle,
  startGroupBattle,
  battleHistory,
  currentBattle,
  battleTopics,
  myStats,
} from "../controllers/battleController.js";
import { leaderboard, myLeague, rules } from "../controllers/leagueController.js";
import { dashboard } from "../controllers/studentController.js";
import { today as tournamentToday, start as tournamentStart, answer as tournamentAnswer, finish as tournamentFinish } from "../controllers/tournamentController.js";
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
battleRouter.get("/:id/stream", protect, rateLimit({ windowMs: 60_000, max: 30, key: "battle-stream" }), streamBattle);
battleRouter.get("/:id", protect, rateLimit({ windowMs: 60_000, max: 120, key: "battle-poll" }), getBattle);
battleRouter.post("/:id/answer", protect, rateLimit({ windowMs: 60_000, max: 60, key: "battle-answer" }), answerQuestion);
battleRouter.post("/:id/leave", protect, leaveBattle);
battleRouter.post("/:id/start", protect, startGroupBattle);

export const leagueRouter = express.Router();
leagueRouter.get("/rules", protect, rules);
leagueRouter.get("/me", protect, myLeague);
leagueRouter.get("/leaderboard", protect, leaderboard);

export const studentRouter = express.Router();
studentRouter.get("/dashboard", protect, dashboard);

export const tournamentRouter = express.Router();
tournamentRouter.get("/today", protect, tournamentToday);
tournamentRouter.post("/today/start", protect, rateLimit({ windowMs: 60_000, max: 10, key: "tour-start" }), tournamentStart);
tournamentRouter.post("/today/answer", protect, rateLimit({ windowMs: 60_000, max: 60, key: "tour-answer" }), tournamentAnswer);
tournamentRouter.post("/today/finish", protect, tournamentFinish);
