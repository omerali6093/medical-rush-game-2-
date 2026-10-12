import mongoose from 'mongoose'
import { config } from './config'
import './models'
import dns from 'dns'
dns.setServers(['1.1.1.1', '8.8.8.8'])

// export async function connectDb (uri = config.mongoUri) {
//   if (!uri) {
//     throw new Error('MONGODB_URI is missing from the .env file')
//   }

//   mongoose.set('strictQuery', true)
//   await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
//   await Promise.all(
//     Object.values(mongoose.models).map(m =>
//       m.syncIndexes().catch(() => m.init())
//     )
//   )
// }


export async function connectDb(uri = config.mongoUri) {
  const cleanedUri = uri.trim();

  console.log("MongoDB URI diagnostic:", {
    startsWithMongoDB: cleanedUri.startsWith("mongodb://"),
    startsWithMongoDBSRV: cleanedUri.startsWith("mongodb+srv://"),
    length: cleanedUri.length,
    firstCharacters: JSON.stringify(cleanedUri.slice(0, 15)),
  });

  if (
    !cleanedUri.startsWith("mongodb://") &&
    !cleanedUri.startsWith("mongodb+srv://")
  ) {
    throw new Error(
      "Invalid MONGODB_URI. Check the environment variable being loaded."
    );
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(cleanedUri, {
    serverSelectionTimeoutMS: 8000,
  });
  
  console.log("Mongodb Databse connected successfully")

  await Promise.all(
    Object.values(mongoose.models).map((m) =>
      m.syncIndexes().catch(() => m.init())
    )
  );
}

export const disconnectDb = () => mongoose.disconnect()
