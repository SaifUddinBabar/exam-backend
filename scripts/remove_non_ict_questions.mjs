import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const REMOVE_IDS = [
  '6af72ce7b3fef9f3900975f9', // Aerobic respiration C6H12O6
  '6af733a111ee24af7b2db449', // Haber process ammonia
  '6af733b311ee24af7b2db51b', // Yeast anaerobic respiration C6H12O6
  '6af733b511ee24af7b2db545', // Titration sodium sulfite KMnO4
  '6af733b611ee24af7b2db56c', // Ammonia thermochemistry kJ/mol
  '6af733de11ee24af7b2db903', // Convex lens focal length
  '6af733e411ee24af7b2db9a2', // Commercial bank cash deposit
  '6af733ff11ee24af7b2dbbbe', // Golgi body eukaryotic cells
  '6af7340311ee24af7b2dbc2d', // Krebs cycle citric acid
  '6af73d35889b8ce675c04ae4', // Gravitation F = G m1 m2 / r^2
  '6af73d3b889b8ce675c04b6b', // Math function domain f(x) = x^2
  '6af73d3b889b8ce675c04b6e', // Chemical equilibrium constant K1 = 1/K
  '6af73d47889b8ce675c04cb3', // Zero-order reaction kinetics moldm-3
  '6af73d47889b8ce675c04cb6', // Parallel plate capacitor dielectric k=20
  '6af73d55889b8ce675c04e2c', // Gas molecules kinetic energy
  '6af73d5d889b8ce675c04f18'  // Nervous system hypothalamus
];

async function removeNonIctQuestions() {
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const questionsColl = db.collection('questions');
  const examsColl = db.collection('exams');

  const beforeTotal = await questionsColl.countDocuments();
  console.log(`Current questions in database: ${beforeTotal}`);

  const objectIds = REMOVE_IDS.map(id => new mongoose.Types.ObjectId(id));

  // 1. Fetch and backup the questions
  const toDelete = await questionsColl.find({ _id: { $in: objectIds } }).toArray();
  console.log(`Found ${toDelete.length} questions to remove.`);

  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const backupFile = path.join(backupDir, `removed_non_ict_questions_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(toDelete, null, 2), 'utf-8');
  console.log(`✅ Safe backup created at: ${backupFile}`);

  // 2. Check if any existing exam references these questions
  const referencingExams = await examsColl.find({
    questions: { $in: objectIds }
  }).toArray();

  if (referencingExams.length > 0) {
    console.log(`⚠️ Warning: ${referencingExams.length} exams reference some of these questions:`);
    for (const ex of referencingExams) {
      console.log(`- Exam ID: ${ex._id}, Title: ${ex.title}`);
      // Remove these questions from exam.questions array to avoid broken exam loading
      await examsColl.updateOne(
        { _id: ex._id },
        { $pull: { questions: { $in: objectIds } } }
      );
    }
    console.log(`Cleaned question references from exams.`);
  } else {
    console.log(`No existing exams reference any of these 16 questions.`);
  }

  // 3. Delete from questions collection
  const deleteResult = await questionsColl.deleteMany({ _id: { $in: objectIds } });
  console.log(`🗑️ Deleted ${deleteResult.deletedCount} non-ICT questions.`);

  const afterTotal = await questionsColl.countDocuments();
  console.log(`New total questions in database: ${afterTotal} (Expected: ${beforeTotal - deleteResult.deletedCount})`);

  await mongoose.disconnect();
}

removeNonIctQuestions().catch(console.error);
