import mongoose from 'mongoose';

const thumbnailSchema = new mongoose.Schema({
  prompt: {
    type: String,
    required: true,
  },
  imageUrl: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Thumbnail = mongoose.models.Thumbnail || mongoose.model('Thumbnail', thumbnailSchema);
