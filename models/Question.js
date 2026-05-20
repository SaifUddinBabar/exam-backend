import mongoose from "mongoose";

const questionSchema =
  new mongoose.Schema({

    className: {
      type: String,
      default: ""
    },

    subject: {
      type: String,
      default: ""
    },

    chapter: {
      type: String,
      default: ""
    },

    topic: {
      type: String,
      default: ""
    },

    questionType: {
      type: String,
      default: "normal"
    },

    boardYear: {
      type: String,
      default: ""
    },

    boardName: {
      type: String,
      default: ""
    },

    question: {
      type: String,
      required: true
    },

    options: {
      type: [String],
      default: []
    },

    correctAnswer: {
      type: String,
      required: true
    },

    tutorId: {
      type: String,
      default: ""
    },

    image: {
      type: String,
      default: ""
    }

  });

export default mongoose.model(
  "Question",
  questionSchema
);