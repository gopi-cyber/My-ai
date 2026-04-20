import { mock } from 'bun:test';

/**
 * A more robust chainable Mock Supabase Client for unit testing.
 * Supports select, insert, upsert, update, delete, eq, in, or, like, order, limit, single, maybeSingle.
 */
export class MockSupabaseClient {
  private data: Record<string, any[]> = {};

  constructor(initialData: Record<string, any[]> = {}) {
    this.data = initialData;
  }

  reset() {
    this.data = {};
  }

  from(table: string) {
    const getTableData = () => this.data[table] || [];
    
    // We'll store the query state here
    let filters: Array<(row: any) => boolean> = [];
    let limitCount: number | null = null;
    let operation: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
    let opData: any = null;
    let upsertOptions: any = null;

    const execute = () => {
      let resultData = getTableData();
      
      // Apply filters
      for (const filter of filters) {
        resultData = resultData.filter(filter);
      }

      // Execute operation
      if (operation === 'insert') {
        const rows = Array.isArray(opData) ? opData : [opData];
        this.data[table] = [...getTableData(), ...rows];
        return { data: rows, error: null };
      } else if (operation === 'upsert') {
        const rows = Array.isArray(opData) ? opData : [opData];
        const current = getTableData();
        const onConflict = upsertOptions?.onConflict || 'id';
        
        const newData = [...current];
        for (const row of rows) {
          const index = newData.findIndex(r => String(r[onConflict]) === String(row[onConflict]));
          if (index !== -1) {
            newData[index] = { ...newData[index], ...row };
          } else {
            newData.push(row);
          }
        }
        this.data[table] = newData;
        return { data: rows, error: null };
      } else if (operation === 'delete') {
        const toDeleteIds = new Set(resultData.map(r => r.id));
        this.data[table] = getTableData().filter(r => !toDeleteIds.has(r.id));
        return { data: null, error: null };
      } else if (operation === 'update') {
        const toUpdateIds = new Set(resultData.map(r => r.id));
        this.data[table] = getTableData().map(r => toUpdateIds.has(r.id) ? { ...r, ...opData } : r);
        return { data: opData, error: null };
      } else {
        // Select
        if (limitCount !== null) {
          resultData = resultData.slice(0, limitCount);
        }
        return { data: resultData, error: null };
      }
    };

    const builder: any = {
      select: mock((_columns: string) => {
        operation = 'select';
        return builder;
      }),

      insert: mock((rows: any | any[]) => {
        operation = 'insert';
        opData = rows;
        return builder;
      }),

      upsert: mock((rows: any | any[], options?: any) => {
        operation = 'upsert';
        opData = rows;
        upsertOptions = options;
        return builder;
      }),

      update: mock((values: any) => {
        operation = 'update';
        opData = values;
        return builder;
      }),

      delete: mock(() => {
        operation = 'delete';
        return builder;
      }),

      eq: mock((column: string, value: any) => {
        filters.push((row: any) => String(row[column]) === String(value));
        return builder;
      }),

      in: mock((column: string, values: any[]) => {
        const strValues = values.map(v => String(v));
        filters.push((row: any) => strValues.includes(String(row[column])));
        return builder;
      }),

      like: mock((column: string, pattern: string) => {
        const regexStr = pattern.replace(/%/g, '.*');
        const regex = new RegExp(`^${regexStr}$`, 'i');
        filters.push((row: any) => regex.test(String(row[column])));
        return builder;
      }),

      or: mock((query: string) => {
        // Specialized logic for facts inner join simulation in retrieveForMessage
        if (query.includes('facts.object.ilike') || query.includes('facts.predicate.ilike')) {
          // Find term between % signs
          const match = query.match(/%([^%]+)%/);
          const term = match ? match[1] : '';
          
          if (term) {
            const facts = this.data['facts'] || [];
            const matchingFactSubjectIds = new Set(facts
              .filter((f: any) => 
                String(f.object).toLowerCase().includes(term.toLowerCase()) || 
                String(f.predicate).toLowerCase().includes(term.toLowerCase())
              )
              .map((f: any) => f.subject_id));
            
            filters.push((e: any) => matchingFactSubjectIds.has(e.id));
          }
          return builder;
        }

        // Standard OR parser
        const parts = query.split(',');
        const orFilters: Array<(row: any) => boolean> = parts.map(part => {
          const subparts = part.split('.');
          if (subparts.length < 3) return () => false;
          const col = subparts[0] as string;
          const op = subparts[1] as string;
          const val = subparts[2] as string;
          
          if (op === 'eq') return (row: any) => String(row[col]) === val;
          if (op === 'is' && val === 'null') return (row: any) => row[col] === null;
          if (op === 'ilike') {
            const t = val.replace(/%/g, '');
            return (row: any) => String(row[col]).toLowerCase().includes(t.toLowerCase());
          }
          return () => false;
        });

        filters.push((row: any) => orFilters.some(f => f(row)));
        return builder;
      }),

      gte: mock((column: string, value: any) => {
        filters.push((row: any) => row[column] >= value);
        return builder;
      }),

      gt: mock((column: string, value: any) => {
        filters.push((row: any) => row[column] > value);
        return builder;
      }),

      lte: mock((column: string, value: any) => {
        filters.push((row: any) => row[column] <= value);
        return builder;
      }),

      lt: mock((column: string, value: any) => {
        filters.push((row: any) => row[column] < value);
        return builder;
      }),

      neq: mock((column: string, value: any) => {
        filters.push((row: any) => String(row[column]) !== String(value));
        return builder;
      }),

      order: mock(() => builder),
      limit: mock((count: number) => {
        limitCount = count;
        return builder;
      }),

      select: mock((_columns: string, options?: { count?: string; head?: boolean }) => {
        operation = 'select';
        return builder;
      }),

      is: mock((column: string, value: any) => {
        filters.push((row: any) => row[column] === value);
        return builder;
      }),

      not: mock((column: string, op: string, value: any) => {
        if (op === 'is' && value === null) {
          filters.push((row: any) => row[column] !== null);
        } else {
          filters.push((row: any) => row[column] !== value);
        }
        return builder;
      }),

      single: mock(async () => {
        const result = execute();
        const data = result.data?.[0];
        return { data: data || null, error: data ? null : { message: 'Not found' } };
      }),

      maybeSingle: mock(async () => {
        const result = execute();
        const data = result.data?.[0];
        return { data: data || null, error: null };
      }),

      then: mock((resolve: any) => {
        const result = execute();
        // Support for .select(..., { count: 'exact' })
        // Since execute() returns {data, error}, we can augment it
        const finalResult = { 
          ...result, 
          count: result.data?.length ?? 0
        };
        return Promise.resolve(finalResult).then(resolve);
      })
    };

    return builder;
  }
}

/**
 * Singleton instance for easy testing
 */
export const mockDb = new MockSupabaseClient();
