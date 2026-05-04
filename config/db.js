import mongoose from "mongoose";

const connectDB = async () => {
  try {
    console.log("SERVER DB:", process.env.MONGO_URI);

    await mongoose.connect(process.env.MONGO_URI);

    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("DB ERROR:", err);
    process.exit(1);
  }
};

export default connectDB;