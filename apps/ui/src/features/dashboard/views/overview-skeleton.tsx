import "../../../styles/dashboard/overview-skeleton.css";

// Overview loading placeholders. Each one reuses the classes of the row or
// list it stands in for, so it takes the same space. They are decorative:
// the Overview announces loading once through its own status message.

/** A bar in place of a value; its line keeps the height of the text. */
export function SkeletonText({ width }: { width: string }) {
  return <span className="overviewSkeleton" style={{ width }} aria-hidden="true" />;
}

const listStyle = (height: number | undefined) => (height ? { height } : undefined);

export function UsageBannerSkeleton({ height, gap }: { height: number; gap: number }) {
  return (
    <div
      className="overviewSkeletonBlock"
      style={{ height, marginBottom: gap }}
      aria-hidden="true"
    />
  );
}

export function AttentionListSkeleton({ rows, height }: { rows: number; height?: number }) {
  return (
    <div
      className="attentionList overviewSkeletonList"
      style={listStyle(height)}
      aria-hidden="true"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div className="attentionClear overviewSkeletonRow" key={index}>
          <i />
          <div>
            <strong>
              <SkeletonText width="62%" />
            </strong>
            <small>
              <SkeletonText width="86%" />
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DeviceListSkeleton({ rows, height }: { rows: number; height?: number }) {
  return (
    <div
      className="overviewDeviceList overviewSkeletonList"
      style={listStyle(height)}
      aria-hidden="true"
    >
      {/* No computers yet: one row in place of "Add your first computer". */}
      {Array.from({ length: Math.max(1, rows) }, (_, index) => (
        <div className="overviewDeviceRow overviewSkeletonRow" key={index}>
          <div className="deviceIcon" />
          <div>
            <strong>
              <SkeletonText width="48%" />
            </strong>
            <span>
              <SkeletonText width="70%" />
            </span>
          </div>
          {rows > 0 && (
            <div className="overviewDeviceMeta">
              <span>
                <SkeletonText width="5ch" />
              </span>
              <small>
                <SkeletonText width="7ch" />
              </small>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ActivityListSkeleton({ rows, height }: { rows: number; height?: number }) {
  return (
    <div className="activityList overviewSkeletonList" style={listStyle(height)} aria-hidden="true">
      {rows ? (
        Array.from({ length: rows }, (_, index) => (
          <div className="activityItem overviewSkeletonRow" key={index}>
            <i className="eventIcon" />
            <div>
              <strong>
                <SkeletonText width="44%" />
              </strong>
              <span>
                <SkeletonText width="78%" />
              </span>
            </div>
          </div>
        ))
      ) : (
        <div className="activityEmpty overviewSkeletonRow">
          <strong>
            <SkeletonText width="40%" />
          </strong>
          <span>
            <SkeletonText width="80%" />
          </span>
        </div>
      )}
    </div>
  );
}
