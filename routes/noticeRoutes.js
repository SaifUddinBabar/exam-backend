import express from "express";
import { createNotice, listMyNotices, updateNotice, archiveNotice, listStudentNotices, markNoticeRead } from "../controllers/noticeController.js";
import { protect, authorize } from "../middleware/auth.js";
import { attachmentUpload } from "../middleware/upload.js";

const router = express.Router();
const staff = authorize("super_admin", "tutor", "org_admin");

router.get("/", protect, listStudentNotices);
router.post("/:id/read", protect, markNoticeRead);

router.get("/manage", protect, staff, listMyNotices);
router.post("/", protect, staff, attachmentUpload.single("attachment"), createNotice);
router.put("/:id", protect, staff, updateNotice);
router.delete("/:id", protect, staff, archiveNotice);

export default router;
