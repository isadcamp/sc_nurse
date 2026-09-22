package domain

// Schedule statuses
const (
	StatusDraft       = "draft"
	StatusGenerated   = "generated"
	StatusUnderReview = "under_review"
	StatusApproved    = "approved"
	StatusPublished   = "published"
	StatusClosed      = "closed"
)

// validTransitions maps each status to its allowed next statuses.
var validTransitions = map[string][]string{
	StatusDraft:       {StatusGenerated},
	StatusGenerated:   {StatusUnderReview},
	StatusUnderReview: {StatusApproved, StatusGenerated},
	StatusApproved:    {StatusPublished},
	StatusPublished:   {StatusClosed, StatusDraft},
	StatusClosed:      {StatusPublished}, // Re-open allows moving back to published
}

// EditableStatuses are statuses in which assignments can be modified.
var EditableStatuses = map[string]bool{
	StatusDraft:     true,
	StatusGenerated: true,
}

// ValidTransition checks whether moving from→to is allowed.
func ValidTransition(from, to string) bool {
	for _, s := range validTransitions[from] {
		if s == to {
			return true
		}
	}
	return false
}

// TransitionAction returns the audit action name for a status change.
func TransitionAction(to string) string {
	switch to {
	case StatusDraft:
		return "unpublish"
	case StatusGenerated:
		return "generate"
	case StatusUnderReview:
		return "submit_review"
	case StatusApproved:
		return "approve"
	case StatusPublished:
		return "publish"
	case StatusClosed:
		return "close"
	default:
		return "transition"
	}
}
