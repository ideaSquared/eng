import { z } from 'zod';
const PackageSchema = z.object({ version: z.string() });
export const readVersion = (packageJson) => PackageSchema.parse(JSON.parse(packageJson)).version;
