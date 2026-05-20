// ==============================
// controllers/examController.js
// ==============================

import Exam from "../models/Exam.js";
import Submission from "../models/Submission.js";
import Question from "../models/Question.js";

// ==============================
// GENERATE EXAM CODE
// ==============================
const generateCode = () => {
return Math.random()
.toString(36)
.substring(2, 7)
.toUpperCase();
};

// ==============================
// CREATE EXAM
// ==============================
export const createExam = async (req, res) => {

try {

```
const {
  title,
  questions,
  duration
} = req.body;

// VALIDATION
if (
  !title ||
  !questions ||
  questions.length === 0
) {

  return res.status(400).json({
    message:
      "Title and questions are required"
  });
}

// CREATE EXAM
const exam = await Exam.create({

  title,

  questions: questions.map((q) =>
    q.toString()
  ),

  duration,

  examCode: generateCode()

});

res.status(201).json(exam);
```

} catch (err) {

```
res.status(500).json({
  message: err.message
});
```

}
};

// ==============================
// GET SINGLE EXAM
// ==============================
export const getExam = async (req, res) => {

try {

```
const exam = await Exam.findOne({
  examCode: req.params.code
});

if (!exam) {

  return res.status(404).json({
    message: "Exam not found"
  });
}

// FETCH QUESTIONS
const questions = await Question.find({
  _id: {
    $in: exam.questions
  }
});

res.json({
  ...exam._doc,
  questions
});
```

} catch (err) {

```
res.status(500).json({
  message: err.message
});
```

}
};

// ==============================
// SUBMIT EXAM
// ==============================
export const submitExam = async (req, res) => {

try {

```
const {
  examCode,
  name,
  roll,
  answers
} = req.body;

// FIND EXAM
const exam = await Exam.findOne({
  examCode
});

if (!exam) {

  return res.status(404).json({
    message: "Exam not found"
  });
}

// FETCH QUESTIONS
const questions = await Question.find({
  _id: {
    $in: exam.questions
  }
});

// SCORE COUNT
let score = 0;

questions.forEach((q) => {

  if (
    answers[q._id] === q.correctAnswer
  ) {

    score++;
  }
});

// SAVE SUBMISSION
await Submission.create({

  examCode,
  name,
  roll,
  score

});

res.json({
  score,
  answers,
  questions
});
```

} catch (err) {

```
res.status(500).json({
  message: err.message
});
```

}
};

// ==============================
// GET RANKING
// ==============================
export const getRanking = async (req, res) => {

try {

```
const data = await Submission.find({
  examCode: req.params.code
}).sort({
  score: -1
});

res.json(data);
```

} catch (err) {

```
res.status(500).json({
  message: err.message
});
```

}
};

// ==============================
// GET STATS
// ==============================
export const getStats = async (req, res) => {

try {

```
const examCount =
  await Exam.countDocuments();

const submissionCount =
  await Submission.countDocuments();

const questionCount =
  await Question.countDocuments();

res.json({

  examCount,
  submissionCount,
  questionCount

});
```

} catch (err) {

```
res.status(500).json({
  message: err.message
});
```

}
};

// ==============================
// GET ALL EXAMS
// ==============================
export const getAllExams = async (req, res) => {

try {

```
const exams = await Exam.find()
  .sort({
    createdAt: -1
  });

const examsWithCount =
  await Promise.all(

    exams.map(async (exam) => {

      const submissionCount =
        await Submission.countDocuments({

          examCode:
            exam.examCode

        });

      return {

        ...exam._doc,
        submissionCount

      };
    })
  );

res.json(examsWithCount);
```

} catch (err) {

```
res.status(500).json({
  message: err.message
});
```

}
};

// ==============================
// DELETE SINGLE EXAM
// ==============================
export const deleteExam = async (req, res) => {

try {

```
const { examCode } = req.params;

await Exam.deleteOne({
  examCode
});

await Submission.deleteMany({
  examCode
});

res.json({
  message:
    "Exam deleted successfully"
});
```

} catch (err) {

```
res.status(500).json({
  message: err.message
});
```

}
};

// ==============================
// DELETE ALL DATA
// ==============================
export const clearOldData = async (
req,
res
) => {

try {

```
await Exam.deleteMany({});
await Submission.deleteMany({});

res.json({
  message:
    "All data deleted successfully"
});
```

} catch (err) {

```
res.status(500).json({
  message: err.message
});
```

}
};
