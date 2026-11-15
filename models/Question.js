import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {

    // ==============================
    // BASIC INFO
    // ==============================
    className: {
      type: String,
      trim: true,
      default: ""
    },

    subject: {
      type: String,
      trim: true,
      required: true
    },

    chapter: {
      type: String,
      trim: true,
      required: true
    },

    topic: {
      type: String,
      trim: true,
      default: ""
    },

    // ==============================
    // DIFFICULTY
    // ==============================
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard", "unclassified"],
      default: "medium",
      required: true
    },

    // ==============================
    // QUESTION TYPE
    // ==============================
    questionType: {
      type: String,
      enum: ["normal", "board"],
      default: "normal",
      required: true
    },

    // ==============================
    // BOARD INFO
    // ==============================
    boardYear: {
      type: String,

      required: function () {
        return this.questionType === "board";
      },

      trim: true,

      validate: {
        validator: function (v) {

          if (this.questionType !== "board") {
            return true;
          }

          return /^[0-9]{4}$/.test(v);

        },

        message: "Board year must be valid"
      }
    },

    boardName: {
      type: String,

      required: function () {
        return this.questionType === "board";
      },

      trim: true,

      enum: {
        values: [
          "",
          "Dhaka",
          "Chittagong",
          "Rajshahi",
          "Cumilla",
          "Jessore",
          "Barishal",
          "Sylhet",
          "Dinajpur",
          "Mymensingh"
        ],

        message: "Invalid board name"
      }
    },

    // ==============================
    // QUESTION
    // ==============================
    question: {
      type: String,
      required: true,
      trim: true,

      minlength: [
        5,
        "Question is too short"
      ]
    },

    // ==============================
    // OPTIONS
    // ==============================
    options: {
      type: [String],

      required: true,

      validate: [

        // minimum 4 options
        {
          validator: function (v) {
            return v.length === 4;
          },

          message:
            "Exactly 4 options required"
        },

        // empty option check
        {
          validator: function (v) {
            return v.every(
              (opt) =>
                typeof opt === "string" &&
                opt.trim() !== ""
            );
          },

          message:
            "Options cannot be empty"
        }
      ]
    },

    // ==============================
    // CORRECT ANSWER
    // ==============================
    correctAnswer: {
      type: String,
      required: true,
      trim: true,

      validate: {
        validator: function (v) {

          return this.options.includes(v);

        },

        message:
          "Correct answer must match one option"
      }
    },

    // ==============================
    // TUTOR
    // ==============================
    tutorId: {
      type: String,
      trim: true,
      default: ""
    },

    // ==============================
    // IMAGE
    // ==============================
    image: {
      type: String,
      trim: true,
      default: ""
    },

    // ==============================
    // EXPLANATION / SOLUTION
    // ==============================
    explanation: {
      type: String,
      trim: true,
      default: ""
    },

    // ==============================
    // BILINGUAL & MULTI-LANGUAGE
    // ==============================
    questionBn: {
      type: String,
      trim: true,
      default: ""
    },
    questionEn: {
      type: String,
      trim: true,
      default: ""
    },
    optionsBn: {
      type: [String],
      default: []
    },
    optionsEn: {
      type: [String],
      default: []
    },
    explanationBn: {
      type: String,
      trim: true,
      default: ""
    },
    explanationEn: {
      type: String,
      trim: true,
      default: ""
    },
    version: {
      type: String,
      enum: ["bangla", "english", "bilingual", null],
      default: null,
      index: true
    },

    // ==============================
    // TENANCY & ACCESS
    // ==============================
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true
    },

    isPublic: {
      type: Boolean,
      default: true,
      index: true
    },

    // Reversible hide flag (e.g. an approved duplicate). Hidden questions stay in the
    // database and in any exam that already uses them; they are only excluded from
    // browsing, practice and battle selection.
    hidden: { type: Boolean, default: false },
    hiddenReason: { type: String, trim: true, default: "" },
    duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: "Question", default: null }

  },

  {
    timestamps: true
  }
);

// ==============================
// INDEX FOR FAST FILTERING
// ==============================
questionSchema.index({
  questionType: 1,
  boardName: 1,
  boardYear: 1
});

questionSchema.index({
  subject: 1,
  chapter: 1,
  difficulty: 1
});

questionSchema.index({
  organizationId: 1,
  isPublic: 1
});

// ==============================
// PREVENT DUPLICATE QUESTIONS
// ==============================
questionSchema.index(
  {
    question: 1,
    boardName: 1,
    boardYear: 1
  },
  {
    unique: false
  }
);

// ==============================
// EXPORT
// ==============================
const Question = mongoose.model(
  "Question",
  questionSchema
);

export default Question;