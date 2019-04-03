export declare function arrayQuery(
    query: { [key: string]: any; },
    filters: (string | { source: string, as: string })[] | string,
    optionSource?: { mergeDeptIds?: string[] },
): any