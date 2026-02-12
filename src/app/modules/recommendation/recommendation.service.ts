// import { askOpenRouter } from "../../helper/openRouter";
// import prisma from "../../utils/prisma";

// const getAIEventRecommendation = async (userEmail: string) => {
//   console.log("========== AI RECOMMENDATION DEBUG START ==========");

//   try {
//     // 1️⃣ Get User
//     const user = await prisma.user.findUnique({
//       where: { email: userEmail },
//       include: {
//         participants: {
//           include: {
//             event: true,
//           },
//         },
//       },
//     });

//     console.log("🔹 USER FOUND:", user?.email);
//     console.log("🔹 USER INTERESTS:", user?.interests);
//     console.log("🔹 USER ADDRESS:", user?.address);

//     if (!user || user.isDeleted) {
//       console.log("❌ User not found or deleted.");
//       return [];
//     }

//     // 2️⃣ Past Participated Events
//     const pastEvents = user.participants.map((p) => p.event);

//     console.log("🔹 PAST EVENTS COUNT:", pastEvents.length);

//     // 3️⃣ Get Upcoming Open Events
//     const events = await prisma.event.findMany({
//       where: {
//         status: 'OPEN',
//         dateTime: {
//           gt: new Date(),
//         },
//       },
//       include: {
//         participants: true,
//       },
//     });

//     console.log("🔹 UPCOMING OPEN EVENTS FOUND:", events.length);

//     if (events.length === 0) {
//       console.log("❌ No upcoming OPEN events found.");
//       return [];
//     }

//     // 4️⃣ Format events
//     const formattedEvents = events.map((event) => ({
//       id: event.id,
//       title: event.title,
//       type: event.type,
//       description: event.description,
//       location: event.location,
//       dateTime: event.dateTime,
//       participantsCount: event.participants.length,
//       joiningFee: event.joiningFee,
//     }));

//     console.log("🔹 FORMATTED EVENTS SAMPLE:", formattedEvents[0]);

//     // 5️⃣ Prepare simplified past events (reduce token usage)
//     const simplifiedPastEvents = pastEvents.map((e) => ({
//       title: e.title,
//       type: e.type,
//       location: e.location,
//     }));

//     console.log("🔹 SIMPLIFIED PAST EVENTS:", simplifiedPastEvents);

//     // 6️⃣ AI Messages
//     const systemMessage = {
//       role: 'system',
//       content:
//         'You are an intelligent event recommendation engine. Match users to relevant events using interests, participation history, and location.',
//     };

//     const userMessage = {
//       role: 'user',
//       content: `
// USER PROFILE:
// Interests: ${user.interests?.join(', ') || 'None'}
// Location: ${user.address || 'Unknown'}

// PAST EVENTS:
// ${JSON.stringify(simplifiedPastEvents, null, 2)}

// AVAILABLE EVENTS:
// ${JSON.stringify(formattedEvents, null, 2)}

// INSTRUCTIONS:
// 1. Match by interests.
// 2. Match by past event similarity.
// 3. Prefer same location.
// 4. Prefer higher participantsCount.
// 5. Return max 6 events.
// 6. Return ONLY valid JSON array.
// 7. Each object must contain:
//    - id
//    - title
//    - location
//    - type
//    - matchReason

// NO MARKDOWN. NO TEXT OUTSIDE JSON.
// `,
//     };

//     console.log("🔹 Sending request to OpenRouter...");

//     const response = await askOpenRouter([systemMessage, userMessage]);

//     console.log("🧠 AI RAW RESPONSE:");
//     console.log(response);

//     // Clean markdown
//     const cleanedJson = response
//       .replace(/```(?:json)?\s*/g, '')
//       .replace(/```$/g, '')
//       .trim();

//     console.log("🔹 CLEANED AI RESPONSE:");
//     console.log(cleanedJson);

//     let suggestedEvents;

//     try {
//       suggestedEvents = JSON.parse(cleanedJson);
//     } catch (parseError) {
//       console.error("❌ JSON PARSE ERROR:", parseError);
//       console.log("❌ Failed JSON:", cleanedJson);
//       return [];
//     }

//     if (!Array.isArray(suggestedEvents)) {
//       console.log("❌ AI response is not an array.");
//       return [];
//     }

//     console.log("✅ AI RECOMMENDATION SUCCESS:", suggestedEvents.length);
//     console.log("========== AI RECOMMENDATION DEBUG END ==========");

//     return suggestedEvents;

//   } catch (error) {
//     console.error("🚨 SERVICE LEVEL ERROR:", error);

//     console.log("🔄 Running fallback logic...");

//     // Fallback: return first 5 open events
//     const fallbackEvents = await prisma.event.findMany({
//       where: { status: 'OPEN' },
//       take: 5,
//     });

//     return fallbackEvents.map((event) => ({
//       id: event.id,
//       title: event.title,
//       location: event.location,
//       type: event.type,
//       matchReason: "Fallback recommendation due to AI failure.",
//     }));
//   }
// };

// export const RecommendationService = {
//   getAIEventRecommendation,
// };



import { askOpenRouter } from "../../helper/openRouter";
import prisma from "../../utils/prisma";

const getAIEventRecommendation = async (userEmail: string) => {
    console.log("========== AI RECOMMENDATION DEBUG START ==========");

    try {
        // 1️⃣ Get User
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            include: {
                participants: {
                    include: {
                        event: true,
                    },
                },
            },
        });

        if (!user || user.isDeleted) {
            console.log("❌ User not found or deleted.");
            return [];
        }

        console.log("🔹 USER FOUND:", user.email);
        console.log("🔹 USER INTERESTS:", user.interests);
        console.log("🔹 USER ADDRESS:", user.address);

        // 2️⃣ Past Participated Events
        const pastEvents = user.participants.map((p) => p.event);
        const hasPastEvents = pastEvents.length > 0;

        console.log("🔹 PAST EVENTS COUNT:", pastEvents.length);

        // 3️⃣ Get Upcoming Open Events
        const events = await prisma.event.findMany({
            where: {
                status: "OPEN",
                dateTime: {
                    gt: new Date(),
                },
            },
            include: {
                participants: true,
            },
        });

        console.log("🔹 UPCOMING OPEN EVENTS FOUND:", events.length);

        // 🚨 If No Upcoming Events
        if (events.length === 0) {
            console.log("❌ No upcoming OPEN events found.");

            return [
                {
                    id: null,
                    title: "No Upcoming Events Available",
                    location: user.address || "Your Area",
                    type: "N/A",
                    matchReason:
                        "Currently there are no open upcoming events. Please check back later.",
                },
            ];
        }

        // 4️⃣ Format events
        const formattedEvents = events.map((event) => ({
            id: event.id,
            title: event.title,
            type: event.type,
            description: event.description,
            location: event.location,
            participantsCount: event.participants.length,
            joiningFee: event.joiningFee,
        }));

        const simplifiedPastEvents = pastEvents.map((e) => ({
            title: e.title,
            type: e.type,
            location: e.location,
        }));

        console.log("🔹 SIMPLIFIED PAST EVENTS:", simplifiedPastEvents);

        // 5️⃣ Build Dynamic Prompt
        const systemMessage = {
            role: "system",
            content:
                "You are an intelligent event recommendation engine. Recommend relevant events based on available user data.",
        };

        const userMessage = {
            role: "user",
            content: `
USER PROFILE:
Interests: ${user.interests?.join(", ") || "None"}
Location: ${user.address || "Unknown"}

${hasPastEvents
                    ? `PAST EVENTS:
${JSON.stringify(simplifiedPastEvents, null, 2)}`
                    : `NOTE: User has not participated in any events yet. Focus mainly on interests, location, and popularity.`
                }

AVAILABLE EVENTS:
${JSON.stringify(formattedEvents, null, 2)}

INSTRUCTIONS:
1. If past events exist → prioritize similarity.
2. If no past events → prioritize interests + same location.
3. Prefer higher participantsCount.
4. Return max 6 events.
5. Return ONLY valid JSON array.
6. Each object must contain:
   - id
   - title
   - location
   - type
   - matchReason

NO MARKDOWN.
NO EXTRA TEXT.
`,
        };

        console.log("🔹 Sending request to OpenRouter...");

        const response = await askOpenRouter([systemMessage, userMessage]);

        console.log("🧠 AI RAW RESPONSE:");
        console.log(response);

        // 🔹 Clean markdown
        const cleanedJson = response
            .replace(/```(?:json)?\s*/g, "")
            .replace(/```$/g, "")
            .trim();

        let suggestedEvents;

        try {
            suggestedEvents = JSON.parse(cleanedJson);
        } catch (parseError) {
            console.error("❌ JSON PARSE ERROR:", parseError);

            // 🔥 Popularity fallback if parsing fails
            suggestedEvents = formattedEvents
                .sort((a, b) => b.participantsCount - a.participantsCount)
                .slice(0, 5)
                .map((event) => ({
                    id: event.id,
                    title: event.title,
                    location: event.location,
                    type: event.type,
                    matchReason:
                        "Recommended based on popularity (AI formatting issue).",
                }));
        }

        if (!Array.isArray(suggestedEvents)) {
            console.log("❌ AI response is not an array. Using fallback.");

            suggestedEvents = formattedEvents
                .sort((a, b) => b.participantsCount - a.participantsCount)
                .slice(0, 5)
                .map((event) => ({
                    id: event.id,
                    title: event.title,
                    location: event.location,
                    type: event.type,
                    matchReason:
                        "Recommended based on popularity (Invalid AI structure).",
                }));
        }

        console.log("✅ FINAL RECOMMENDATION COUNT:", suggestedEvents.length);
        console.log("========== AI RECOMMENDATION DEBUG END ==========");

        return suggestedEvents;

    } catch (error) {
        console.error("🚨 SERVICE LEVEL ERROR:", error);
        console.log("🔄 Running fallback logic...");

        const fallbackEvents = await prisma.event.findMany({
            where: { status: "OPEN" },
            include: { participants: true },
            orderBy: {
                participants: {
                    _count: "desc",
                },
            },
            take: 5,
        });

        return fallbackEvents.map((event) => ({
            id: event.id,
            title: event.title,
            location: event.location,
            type: event.type,
            matchReason:
                "Recommended based on popularity (AI service temporarily unavailable).",
        }));
    }
};

export const RecommendationService = {
    getAIEventRecommendation,
};
