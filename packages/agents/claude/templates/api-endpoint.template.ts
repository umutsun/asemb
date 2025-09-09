import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';

// Request validation schema
const {{EndpointName}}Schema = z.object({
  // Define your request body schema here
  field1: z.string().min(1),
  field2: z.number().optional(),
  field3: z.array(z.string()).optional(),
});

// Response type definition
type {{EndpointName}}Response = {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
};

// GET handler
export async function GET(
  request: NextRequest,
  { params }: { params: { id?: string } }
) {
  return withErrorHandler(async () => {
    return withAuth(request, async (user) => {
      return withRateLimit(request, async () => {
        // Get query parameters
        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const search = searchParams.get('search') || '';

        // If ID is provided, get single item
        if (params.id) {
          const item = await prisma.{{modelName}}.findUnique({
            where: { id: params.id },
            include: {
              // Add relations if needed
            },
          });

          if (!item) {
            return NextResponse.json(
              { error: '{{ModelName}} not found' },
              { status: 404 }
            );
          }

          return NextResponse.json({
            success: true,
            data: item,
          });
        }

        // Get paginated list
        const [items, total] = await Promise.all([
          prisma.{{modelName}}.findMany({
            where: {
              // Add search conditions
              ...(search && {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { description: { contains: search, mode: 'insensitive' } },
                ],
              }),
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
          }),
          prisma.{{modelName}}.count({
            where: {
              ...(search && {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { description: { contains: search, mode: 'insensitive' } },
                ],
              }),
            },
          }),
        ]);

        return NextResponse.json({
          success: true,
          data: {
            items,
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit),
            },
          },
        });
      });
    });
  });
}

// POST handler
export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    return withAuth(request, async (user) => {
      return withRateLimit(request, async () => {
        // Parse and validate request body
        const body = await request.json();
        const validatedData = {{EndpointName}}Schema.parse(body);

        // Create new item
        const newItem = await prisma.{{modelName}}.create({
          data: {
            ...validatedData,
            userId: user.id,
          },
        });

        // Return created item
        return NextResponse.json(
          {
            success: true,
            data: newItem,
            message: '{{ModelName}} created successfully',
          },
          { status: 201 }
        );
      });
    });
  });
}

// PUT/PATCH handler
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withErrorHandler(async () => {
    return withAuth(request, async (user) => {
      return withRateLimit(request, async () => {
        // Parse and validate request body
        const body = await request.json();
        const validatedData = {{EndpointName}}Schema.partial().parse(body);

        // Check if item exists
        const existingItem = await prisma.{{modelName}}.findUnique({
          where: { id: params.id },
        });

        if (!existingItem) {
          return NextResponse.json(
            { error: '{{ModelName}} not found' },
            { status: 404 }
          );
        }

        // Check authorization
        if (existingItem.userId !== user.id && !user.isAdmin) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 403 }
          );
        }

        // Update item
        const updatedItem = await prisma.{{modelName}}.update({
          where: { id: params.id },
          data: validatedData,
        });

        return NextResponse.json({
          success: true,
          data: updatedItem,
          message: '{{ModelName}} updated successfully',
        });
      });
    });
  });
}

// DELETE handler
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withErrorHandler(async () => {
    return withAuth(request, async (user) => {
      return withRateLimit(request, async () => {
        // Check if item exists
        const existingItem = await prisma.{{modelName}}.findUnique({
          where: { id: params.id },
        });

        if (!existingItem) {
          return NextResponse.json(
            { error: '{{ModelName}} not found' },
            { status: 404 }
          );
        }

        // Check authorization
        if (existingItem.userId !== user.id && !user.isAdmin) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 403 }
          );
        }

        // Delete item
        await prisma.{{modelName}}.delete({
          where: { id: params.id },
        });

        return NextResponse.json({
          success: true,
          message: '{{ModelName}} deleted successfully',
        });
      });
    });
  });
}