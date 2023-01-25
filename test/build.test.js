"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const massage_spec_1 = require("../build-tools/massage-spec");
test('dropTypelessAttributes works correctly', () => {
    const spec = {
        Fingerprint: 'some-fingerprint',
        PropertyTypes: {
            'CDK::Test::Property': {
                Properties: {
                    Type: {
                        PrimitiveType: 'String',
                    },
                },
            },
        },
        ResourceTypes: {
            'CDK::Test::Resource': {
                Attributes: {
                    Attribute1: {
                        PrimitiveType: 'String',
                    },
                    Attribute2: {},
                },
                Documentation: 'https://documentation-url/cdk/test/resource',
                Properties: {
                    ResourceArn: {
                        PrimitiveType: 'String',
                    },
                },
            },
        },
    };
    massage_spec_1.massageSpec(spec);
    expect(spec).toEqual({
        Fingerprint: 'some-fingerprint',
        PropertyTypes: {
            'CDK::Test::Property': {
                Properties: {
                    Type: {
                        PrimitiveType: 'String',
                    },
                },
            },
        },
        ResourceTypes: {
            'CDK::Test::Resource': {
                Attributes: {
                    Attribute1: ({
                        PrimitiveType: 'String',
                    }),
                },
                Documentation: 'https://documentation-url/cdk/test/resource',
                Properties: {
                    ResourceArn: {
                        PrimitiveType: 'String',
                    },
                },
            },
        },
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVpbGQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJ1aWxkLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSw4REFBMEQ7QUFHMUQsSUFBSSxDQUFDLHdDQUF3QyxFQUFFLEdBQUcsRUFBRTtJQUNsRCxNQUFNLElBQUksR0FBeUI7UUFDakMsV0FBVyxFQUFFLGtCQUFrQjtRQUMvQixhQUFhLEVBQUU7WUFDYixxQkFBcUIsRUFBRTtnQkFDckIsVUFBVSxFQUFFO29CQUNWLElBQUksRUFBRzt3QkFDTCxhQUFhLEVBQUUsUUFBUTtxQkFDRTtpQkFDNUI7YUFDRjtTQUNGO1FBQ0QsYUFBYSxFQUFFO1lBQ2IscUJBQXFCLEVBQUU7Z0JBQ3JCLFVBQVUsRUFBRTtvQkFDVixVQUFVLEVBQUc7d0JBQ1gsYUFBYSxFQUFFLFFBQVE7cUJBQ007b0JBQy9CLFVBQVUsRUFBRyxFQUFnQztpQkFDOUM7Z0JBQ0QsYUFBYSxFQUFFLDZDQUE2QztnQkFDNUQsVUFBVSxFQUFFO29CQUNWLFdBQVcsRUFBRzt3QkFDWixhQUFhLEVBQUUsUUFBUTtxQkFDSztpQkFDL0I7YUFDRjtTQUNGO0tBQ0YsQ0FBQztJQUVGLDBCQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFbEIsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUNuQixXQUFXLEVBQUUsa0JBQWtCO1FBQy9CLGFBQWEsRUFBRTtZQUNiLHFCQUFxQixFQUFFO2dCQUNyQixVQUFVLEVBQUU7b0JBQ1YsSUFBSSxFQUFHO3dCQUNMLGFBQWEsRUFBRSxRQUFRO3FCQUNFO2lCQUM1QjthQUNGO1NBQ0Y7UUFDRCxhQUFhLEVBQUU7WUFDYixxQkFBcUIsRUFBRTtnQkFDckIsVUFBVSxFQUFFO29CQUNWLFVBQVUsRUFBRSxDQUFDO3dCQUNYLGFBQWEsRUFBRSxRQUFRO3FCQUN4QixDQUFDO2lCQUNIO2dCQUNELGFBQWEsRUFBRSw2Q0FBNkM7Z0JBQzVELFVBQVUsRUFBRTtvQkFDVixXQUFXLEVBQUU7d0JBQ1gsYUFBYSxFQUFFLFFBQVE7cUJBQ3hCO2lCQUNGO2FBQ0Y7U0FDRjtLQUNGLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbWFzc2FnZVNwZWMgfSBmcm9tICcuLi9idWlsZC10b29scy9tYXNzYWdlLXNwZWMnO1xuaW1wb3J0IHsgc2NoZW1hIH0gZnJvbSAnLi4vbGliJztcblxudGVzdCgnZHJvcFR5cGVsZXNzQXR0cmlidXRlcyB3b3JrcyBjb3JyZWN0bHknLCAoKSA9PiB7XG4gIGNvbnN0IHNwZWM6IHNjaGVtYS5TcGVjaWZpY2F0aW9uID0ge1xuICAgIEZpbmdlcnByaW50OiAnc29tZS1maW5nZXJwcmludCcsXG4gICAgUHJvcGVydHlUeXBlczoge1xuICAgICAgJ0NESzo6VGVzdDo6UHJvcGVydHknOiB7XG4gICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICBUeXBlOiAoe1xuICAgICAgICAgICAgUHJpbWl0aXZlVHlwZTogJ1N0cmluZycsXG4gICAgICAgICAgfSBhcyBzY2hlbWEuU2NhbGFyUHJvcGVydHkpLCAvLyB0cyBpcyBiZWluZyB3ZWlyZCBhbmQgZG9lc24ndCBjb3JyZWN0bHkgbWF0Y2ggdGhlIHR5cGVcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBSZXNvdXJjZVR5cGVzOiB7XG4gICAgICAnQ0RLOjpUZXN0OjpSZXNvdXJjZSc6IHtcbiAgICAgICAgQXR0cmlidXRlczoge1xuICAgICAgICAgIEF0dHJpYnV0ZTE6ICh7XG4gICAgICAgICAgICBQcmltaXRpdmVUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICB9IGFzIHNjaGVtYS5QcmltaXRpdmVBdHRyaWJ1dGUpLCAvLyB0cyBpcyBiZWluZyB3ZWlyZCBhbmQgZG9lc24ndCBjb3JyZWN0bHkgbWF0Y2ggdGhlIHR5cGVcbiAgICAgICAgICBBdHRyaWJ1dGUyOiAoe30gYXMgc2NoZW1hLlByaW1pdGl2ZUF0dHJpYnV0ZSksXG4gICAgICAgIH0sXG4gICAgICAgIERvY3VtZW50YXRpb246ICdodHRwczovL2RvY3VtZW50YXRpb24tdXJsL2Nkay90ZXN0L3Jlc291cmNlJyxcbiAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgIFJlc291cmNlQXJuOiAoe1xuICAgICAgICAgICAgUHJpbWl0aXZlVHlwZTogJ1N0cmluZycsXG4gICAgICAgICAgfSBhcyBzY2hlbWEuUHJpbWl0aXZlUHJvcGVydHkpLCAvLyB0cyBpcyBiZWluZyB3ZWlyZCBhbmQgZG9lc24ndCBjb3JyZWN0bHkgbWF0Y2ggdGhlIHR5cGVcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfTtcblxuICBtYXNzYWdlU3BlYyhzcGVjKTtcblxuICBleHBlY3Qoc3BlYykudG9FcXVhbCh7XG4gICAgRmluZ2VycHJpbnQ6ICdzb21lLWZpbmdlcnByaW50JyxcbiAgICBQcm9wZXJ0eVR5cGVzOiB7XG4gICAgICAnQ0RLOjpUZXN0OjpQcm9wZXJ0eSc6IHtcbiAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgIFR5cGU6ICh7XG4gICAgICAgICAgICBQcmltaXRpdmVUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICB9IGFzIHNjaGVtYS5TY2FsYXJQcm9wZXJ0eSksIC8vIHRzIGlzIGJlaW5nIHdlaXJkIGFuZCBkb2Vzbid0IGNvcnJlY3RseSBtYXRjaCB0aGUgdHlwZVxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIFJlc291cmNlVHlwZXM6IHtcbiAgICAgICdDREs6OlRlc3Q6OlJlc291cmNlJzoge1xuICAgICAgICBBdHRyaWJ1dGVzOiB7XG4gICAgICAgICAgQXR0cmlidXRlMTogKHtcbiAgICAgICAgICAgIFByaW1pdGl2ZVR5cGU6ICdTdHJpbmcnLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgICBEb2N1bWVudGF0aW9uOiAnaHR0cHM6Ly9kb2N1bWVudGF0aW9uLXVybC9jZGsvdGVzdC9yZXNvdXJjZScsXG4gICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICBSZXNvdXJjZUFybjoge1xuICAgICAgICAgICAgUHJpbWl0aXZlVHlwZTogJ1N0cmluZycsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSk7XG59KTtcbiJdfQ==