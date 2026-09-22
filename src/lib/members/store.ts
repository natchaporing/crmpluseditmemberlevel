import "server-only";

import type { Member } from "@/lib/members/types";

/**
 * Placeholder data source.
 *
 * The production app reads and writes members through the Buzzebees CRM API.
 * That integration is not wired up yet, so this module keeps everything in
 * memory and is the single place to replace when the API details land — see
 * `src/lib/members/service.ts` for the interface the UI depends on.
 *
 * State is per-process and resets on restart. The sample members are
 * fictional; no real customer data is committed to this repository.
 */

function seedMembers(): Member[] {
  return [
    {
      userId: "BPAXX68_1000000000001",
      firstName: "Somchai",
      lastName: "Jaidee",
      contactNumber: "0900000001",
      point: 0,
      levelCode: "Member",
      attributes: {
        lastName: "Jaidee",
        gender: "male",
        emailMarketing: 0,
        dataPrivacy: 101,
        active: true,
        birthDate: 786204000,
        userId: "BPAXX68_1000000000001",
        point: 0,
        firstName: "Somchai",
        termAndCondition: 101,
        contactNumber: "0900000001",
        smsMarketing: 0,
        lineMarketing: 0,
        email: null,
        referenceInfo2: null,
        referenceInfo: null,
      },
      raw: {
        Locale: 1054,
        Refercode: null,
        FullAddress: "",
        Email: "",
        ShippingSubDistrictCode: null,
        Address: null,
        Income: null,
        Latitude: null,
        ConsentAge: 15,
        Gender: "male",
        Interests: null,
      },
    },
    {
      userId: "BPAXX68_1000000000002",
      firstName: "Malee",
      lastName: "Sukjai",
      contactNumber: "0900000002",
      point: 3,
      levelCode: "Plus2_69",
      attributes: {
        lastName: "Sukjai",
        gender: "female",
        emailMarketing: 1,
        dataPrivacy: 101,
        active: true,
        birthDate: 631152000,
        userId: "BPAXX68_1000000000002",
        point: 3,
        firstName: "Malee",
        termAndCondition: 101,
        contactNumber: "0900000002",
        smsMarketing: 1,
        lineMarketing: 0,
        email: "malee@example.com",
        referenceInfo2: null,
        referenceInfo: null,
      },
      raw: {
        Locale: 1054,
        Refercode: null,
        FullAddress: "",
        Email: "malee@example.com",
        ShippingSubDistrictCode: null,
        Address: null,
        Income: null,
        Latitude: null,
        ConsentAge: 15,
        Gender: "female",
        Interests: null,
      },
    },
    {
      userId: "BPAXX68_1000000000003",
      firstName: "Anan",
      lastName: "Thongdee",
      contactNumber: "0900000003",
      point: 128,
      levelCode: "Plus1",
      attributes: {
        lastName: "Thongdee",
        gender: "male",
        emailMarketing: 0,
        dataPrivacy: 101,
        active: true,
        birthDate: 662688000,
        userId: "BPAXX68_1000000000003",
        point: 128,
        firstName: "Anan",
        termAndCondition: 101,
        contactNumber: "0900000003",
        smsMarketing: 0,
        lineMarketing: 1,
        email: null,
        referenceInfo2: null,
        referenceInfo: null,
      },
      raw: {
        Locale: 1054,
        Refercode: null,
        FullAddress: "",
        Email: "",
        ShippingSubDistrictCode: null,
        Address: null,
        Income: null,
        Latitude: null,
        ConsentAge: 15,
        Gender: "male",
        Interests: null,
      },
    },
  ];
}

type Store = {
  members: Member[];
};

const globalForStore = globalThis as unknown as {
  __crmplusStore?: Store;
};

// Survive dev-server hot reloads so edits don't wipe in-flight test data.
export const store: Store = (globalForStore.__crmplusStore ??= {
  members: seedMembers(),
});
