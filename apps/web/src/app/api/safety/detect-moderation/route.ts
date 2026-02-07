import { NextResponse } from "next/server";
import { RekognitionClient, DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";

const client = new RekognitionClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  }
});

export async function POST(request: Request) {
  try {
    const { image } = await request.json();
    // Image is expected to be base64 string without the prefix (e.g. "data:image/jpeg;base64,")
    const buffer = Buffer.from(image.split(",")[1], "base64");

    const command = new DetectModerationLabelsCommand({
      Image: {
        Bytes: buffer,
      },
      MinConfidence: 60, // Adjust confidence threshold as needed
    });

    const response = await client.send(command);
    
    // Map AWS labels to our flags
    const flags = [];
    
    // Check for Nudity
    const nudityLabel = response.ModerationLabels?.find(l => 
      l.ParentName === "Explicit Nudity" || l.Name === "Explicit Nudity" || 
      l.ParentName === "Suggesive" || l.Name === "Suggestive" // AWS categories vary, usually Explicit Nudity covers it
    );

    if (nudityLabel) {
       flags.push({
         type: "nudity",
         score: (nudityLabel.Confidence || 0) / 100,
         threshold: 0.6,
         flagged: true,
         details: { label: nudityLabel.Name }
       });
    }

    // Check for Profanity (Rude Gestures / Middle Finger)
    const rudeGestureLabel = response.ModerationLabels?.find(l => 
        l.Name === "Rude Gestures" || l.ParentName === "Rude Gestures" || l.Name === "Middle Finger"
    );

    if (rudeGestureLabel) {
        flags.push({
            type: "profanity",
            score: (rudeGestureLabel.Confidence || 0) / 100,
            threshold: 0.6,
            flagged: true,
            details: { label: rudeGestureLabel.Name }
        });
    }

    return NextResponse.json({ flags });
  } catch (error) {
    console.error("Rekognition Error:", error);
    return NextResponse.json({ error: "Failed to process image" }, { status: 500 });
  }
}
