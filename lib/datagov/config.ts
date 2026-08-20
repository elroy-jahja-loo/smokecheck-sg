import type { DataGovDatasetConfig } from "@/lib/datagov/types";

const defaultDataGovApiBaseUrl = "https://api-open.data.gov.sg";

export function getDataGovApiBaseUrl() {
  return (process.env.DATAGOV_API_BASE_URL || defaultDataGovApiBaseUrl).replace(/\/$/, "");
}

export function getDataGovDatasetConfigs(): DataGovDatasetConfig[] {
  return [
    {
      key: "dsa",
      sourceId: "datagov-dsa",
      datasetId: requiredEnv("DATAGOV_DSA_DATASET_ID"),
      datasetName: "Designated Smoking Areas",
      agency: "NEA",
      sourceUrl: "https://data.gov.sg/datasets/d_d0fa8f07ef80ab23feaa3b870323bf27/view",
    },
    {
      key: "nsz",
      sourceId: "datagov-nea-no-smoking-zones",
      datasetId: requiredEnv("DATAGOV_NSZ_DATASET_ID"),
      datasetName: "No Smoking Zones",
      agency: "NEA",
      sourceUrl: "https://data.gov.sg/datasets/d_491641889c8add4c7835721bd72aa84a/view",
    },
    {
      key: "nparks-no-smoking",
      sourceId: "datagov-nparks-no-smoking",
      datasetId: requiredEnv("DATAGOV_NPARKS_NO_SMOKING_DATASET_ID"),
      datasetName: "NParks No-Smoking Locations",
      agency: "NParks",
      sourceUrl: "https://data.gov.sg/datasets/d_3c8343c1efaeb05d4d1dbcdd0f599077/view",
    },
  ];
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Data.gov.sg sync`);
  return value;
}
