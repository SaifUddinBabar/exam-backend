export const clearOldData = async (req, res) => {
  try {
    await Exam.deleteMany({});
    await Submission.deleteMany({});

    res.json({
      message: "All data deleted instantly"
    });

  } catch (err) {
    res.status(500).json({ message: "Delete failed" });
  }
};