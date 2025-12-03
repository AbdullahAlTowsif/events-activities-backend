import { EventStatus } from "@prisma/client";

export interface ICreateEvent {
    hostId: string;
    title: string;
    type: string;
    description: string;
    location: string;
    dateTime: string | Date;
    minParticipants?: number;
    maxParticipants?: number;
    joiningFee?: number;
    currency?: string;
    images: string[];
    status?: EventStatus;
}

