package local

import (
	"fmt"
	"os"
	"path/filepath"
)

// GetDirPath uses the given context directory and returns the absolute
// path to the context directory, the relative path of the get3w.yml in that
// context directory, and a non-nil error on success.
func GetDirPath(contextDir string) (dirPath string, err error) {
	if contextDir == "" {
		contextDir = "./"
	}

	if dirPath, err = filepath.Abs(contextDir); err != nil {
		return "", fmt.Errorf("unable to get absolute context directory: %v", err)
	}

	err = os.MkdirAll(dirPath, 0700)
	if err != nil {
		return "", fmt.Errorf("unable to create context directory %q: %v", dirPath, err)
	}

	stat, err := os.Lstat(dirPath)
	if err != nil {
		return "", fmt.Errorf("unable to stat context directory %q: %v", dirPath, err)
	}

	if !stat.IsDir() {
		return "", fmt.Errorf("context must be a directory: %s", dirPath)
	}

	return dirPath, nil
}

// mkdirByFile create directories from filepath
func mkdirByFile(p string) {
	dirpath, _ := filepath.Abs(filepath.Dir(p))
	os.MkdirAll(dirpath, 0700)
}

// IsDirExist return true if directory exists
func IsDirExist(contextDir string) bool {
	if contextDir == "" {
		contextDir = "./"
	}

	dirPath, err := filepath.Abs(contextDir)
	if err != nil {
		return false
	}

	stat, err := os.Lstat(dirPath)
	if err != nil {
		return false
	}

	if !stat.IsDir() {
		return false
	}

	return true
}
