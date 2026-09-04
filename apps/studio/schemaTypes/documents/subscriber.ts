import { Mail } from "lucide-react";
import { defineField, defineType } from "sanity";

export const subscriber = defineType({
  name: "subscriber",
  type: "document",
  title: "Subscriber",
  icon: Mail,
  fields: [
    defineField({
      name: "email",
      type: "string",
      title: "Email",
      description: "The subscriber's email address",
      validation: (rule) => rule.required().email(),
    }),
    defineField({
      name: "subscribedAt",
      type: "datetime",
      title: "Subscribed At",
      description: "When this person signed up for the newsletter",
      initialValue: () => new Date().toISOString(),
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: "email",
      subtitle: "subscribedAt",
    },
  },
});
