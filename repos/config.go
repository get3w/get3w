package repos

import (
	"errors"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
)

// system file or folder names
const (
	KeyConfig    = "get3w.yml"
	KeyReadme    = "README.md"
	KeySummary   = "SUMMARY.md"
	KeyGitIgnore = ".gitignore"
	KeyLicense   = "LICENSE"

	PrefixIncludes = "_includes"
	PrefixContents = "_contents"
	PrefixSections = "_sections"
	PrefixWWWRoot  = "_wwwroot"
)

var (
	// ErrInvalidRepositoryName is an error returned if the repository name did
	// not have the correct form
	ErrInvalidRepositoryName = errors.New("fatal: Invalid repository name (ex: \"get3w.com/myname/myrepo\")")
)

func validateNoSchema(reposName string) error {
	if strings.Contains(reposName, "://") {
		// It cannot contain a scheme!
		return ErrInvalidRepositoryName
	}
	return nil
}

func validateRepository(host, owner, name string) error {
	if !strings.Contains(host, ".") || owner == "" || name == "" {
		return ErrInvalidRepositoryName
	}

	return nil
}

// splitReposName breaks a reposName into an index name and remote name
func splitReposName(reposName string) (string, string, string, error) {
	nameParts := strings.SplitN(strings.Trim(reposName, "/"), "/", 3)
	if len(nameParts) < 2 {
		return "", "", "", ErrInvalidRepositoryName
	}
	if len(nameParts) == 2 {
		return get3w.DefaultRepositoryHost(), nameParts[0], nameParts[1], nil
	}

	return nameParts[0], nameParts[1], nameParts[2], nil
}

// ParseRepository performs the breakdown of a repository name into a Repository.
func ParseRepository(reposName string) (*get3w.Repository, error) {
	if err := validateNoSchema(reposName); err != nil {
		return nil, err
	}

	host, owner, name, err := splitReposName(reposName)
	if err != nil {
		return nil, err
	}

	if err := validateRepository(host, owner, name); err != nil {
		return nil, err
	}

	repoInfo := &get3w.Repository{
		Host:  host,
		Owner: owner,
		Name:  name,
	}

	return repoInfo, nil
}
