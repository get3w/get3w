package client

import (
	"archive/tar"
	"bufio"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	Cli "github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/pkg/httputils"
	"github.com/get3w/get3w/pkg/jsonmessage"
	"github.com/get3w/get3w/pkg/progressreader"
	"github.com/get3w/get3w/pkg/streamformatter"
	"github.com/get3w/get3w/pkg/urlutil"
	"github.com/get3w/get3w/utils"
)

const (
	tarHeaderSize = 512
)

// CmdBuild builds a new image from the source code at a given path.
//
// If '-' is provided instead of a path or URL, Docker will build an image from either a Dockerfile or tar archive read from STDIN.
//
// Usage: docker build [OPTIONS] PATH | URL | -
func (cli *DockerCli) CmdBuild(args ...string) error {
	cmd := Cli.Subcmd("build", []string{"PATH | URL"}, Cli.DockerCommands["build"].Description, true)

	pull := cmd.Bool([]string{"-pull"}, false, "Always attempt to pull a newer version of the image")
	log.Println(pull)

	cmd.ParseFlags(args, true)

	_, err := exec.LookPath("git")
	hasGit := err == nil

	specifiedContext := cmd.Arg(0)
	if specifiedContext == "" {
		specifiedContext = "."
	}

	var (
		contextDir string
		tempDir    string
	)

	switch {
	case urlutil.IsGitURL(specifiedContext) && hasGit:
		tempDir, err = getContextFromGitURL(specifiedContext)
	case urlutil.IsURL(specifiedContext):
		tempDir, err = getContextFromURL(cli.out, specifiedContext)
	default:
		contextDir, err = getContextFromLocalDir(specifiedContext)
	}

	if err != nil {
		return fmt.Errorf("unable to prepare context: %s", err)
	}

	if tempDir != "" {
		defer os.RemoveAll(tempDir)
		contextDir = tempDir
	}

	var excludes []string
	if err := utils.ValidateContextDirectory(contextDir, excludes); err != nil {
		return fmt.Errorf("Error checking context: '%s'.", err)
	}

	log.Println("building...")

	// Setup an upload progress bar
	// FIXME: ProgressReader shouldn't be this annoying to use

	headers := http.Header(make(map[string][]string))
	buf, err := json.Marshal(cli.configFile.AuthConfig)
	if err != nil {
		return err
	}
	headers.Add("X-Registry-Config", base64.URLEncoding.EncodeToString(buf))
	headers.Set("Content-Type", "application/tar")

	if jerr, ok := err.(*jsonmessage.JSONError); ok {
		// If no error code is set, default to 1
		if jerr.Code == 0 {
			jerr.Code = 1
		}
		return Cli.StatusError{Status: jerr.Message, StatusCode: jerr.Code}
	}

	if err != nil {
		return err
	}

	return nil
}

// isUNC returns true if the path is UNC (one starting \\). It always returns
// false on Linux.
func isUNC(path string) bool {
	return runtime.GOOS == "windows" && strings.HasPrefix(path, `\\`)
}

// getDockerfileRelPath uses the given context directory for a `docker build`
// and returns the absolute path to the context directory, the relative path of
// the dockerfile in that context directory, and a non-nil error on success.
func getDockerfileRelPath(givenContextDir string) (absContextDir string, err error) {
	if absContextDir, err = filepath.Abs(givenContextDir); err != nil {
		return "", fmt.Errorf("unable to get absolute context directory: %v", err)
	}

	// The context dir might be a symbolic link, so follow it to the actual
	// target directory.
	//
	// FIXME. We use isUNC (always false on non-Windows platforms) to workaround
	// an issue in golang. On Windows, EvalSymLinks does not work on UNC file
	// paths (those starting with \\). This hack means that when using links
	// on UNC paths, they will not be followed.
	if !isUNC(absContextDir) {
		absContextDir, err = filepath.EvalSymlinks(absContextDir)
		if err != nil {
			return "", fmt.Errorf("unable to evaluate symlinks in context path: %v", err)
		}
	}

	stat, err := os.Lstat(absContextDir)
	if err != nil {
		return "", fmt.Errorf("unable to stat context directory %q: %v", absContextDir, err)
	}

	if !stat.IsDir() {
		return "", fmt.Errorf("context must be a directory: %s", absContextDir)
	}

	return absContextDir, nil
}

// writeToFile copies from the given reader and writes it to a file with the
// given filename.
func writeToFile(r io.Reader, filename string) error {
	file, err := os.OpenFile(filename, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(0600))
	if err != nil {
		return fmt.Errorf("unable to create file: %v", err)
	}
	defer file.Close()

	if _, err := io.Copy(file, r); err != nil {
		return fmt.Errorf("unable to write file: %v", err)
	}

	return nil
}

// getContextFromReader will read the contents of the given reader as either a
// Dockerfile or tar archive to be extracted to a temporary directory used as
// the context directory. Returns the absolute path to the temporary context
// directory, the relative path of the dockerfile in that context directory,
// and a non-nil error on success.
func getContextFromReader(r io.Reader) (absContextDir string, err error) {
	buf := bufio.NewReader(r)

	_, err = buf.Peek(tarHeaderSize)
	if err != nil && err != io.EOF {
		return "", fmt.Errorf("failed to peek context header from STDIN: %v", err)
	}

	if absContextDir, err = ioutil.TempDir("", "docker-build-context-"); err != nil {
		return "", fmt.Errorf("unbale to create temporary context directory: %v", err)
	}

	defer func(d string) {
		if err != nil {
			os.RemoveAll(d)
		}
	}(absContextDir)

	return getDockerfileRelPath(absContextDir)
}

// getContextFromGitURL uses a Git URL as context for a `docker build`. The
// git repo is cloned into a temporary directory used as the context directory.
// Returns the absolute path to the temporary context directory, the relative
// path of the dockerfile in that context directory, and a non-nil error on
// success.
func getContextFromGitURL(gitURL string) (absContextDir string, err error) {
	if absContextDir, err = utils.GitClone(gitURL); err != nil {
		return "", fmt.Errorf("unable to 'git clone' to temporary context directory: %v", err)
	}

	return getDockerfileRelPath(absContextDir)
}

// getContextFromURL uses a remote URL as context for a `docker build`. The
// remote resource is downloaded as either a Dockerfile or a context tar
// archive and stored in a temporary directory used as the context directory.
// Returns the absolute path to the temporary context directory, the relative
// path of the dockerfile in that context directory, and a non-nil error on
// success.
func getContextFromURL(out io.Writer, remoteURL string) (absContextDir string, err error) {
	response, err := httputils.Download(remoteURL)
	if err != nil {
		return "", fmt.Errorf("unable to download remote context %s: %v", remoteURL, err)
	}
	defer response.Body.Close()

	// Pass the response body through a progress reader.
	progReader := &progressreader.Config{
		In:        response.Body,
		Out:       out,
		Formatter: streamformatter.NewStreamFormatter(),
		Size:      response.ContentLength,
		NewLines:  true,
		ID:        "",
		Action:    fmt.Sprintf("Downloading build context from remote url: %s", remoteURL),
	}

	return getContextFromReader(progReader)
}

// getContextFromLocalDir uses the given local directory as context for a
// `docker build`. Returns the absolute path to the local context directory,
// the relative path of the dockerfile in that context directory, and a non-nil
// error on success.
func getContextFromLocalDir(localDir string) (absContextDir string, err error) {
	return getDockerfileRelPath(localDir)
}

var dockerfileFromLinePattern = regexp.MustCompile(`(?i)^[\s]*FROM[ \f\r\t\v]+(?P<image>[^ \f\r\t\v\n#]+)`)

type trustedDockerfile struct {
	*os.File
	size int64
}

func (td *trustedDockerfile) Close() error {
	td.File.Close()
	return os.Remove(td.File.Name())
}

// resolvedTag records the repository, tag, and resolved digest reference
// from a Dockerfile rewrite.
type resolvedTag struct {
	repoInfo          string
	digestRef, tagRef string
}

// rewriteDockerfileFrom rewrites the given Dockerfile by resolving images in
// "FROM <image>" instructions to a digest reference. `translator` is a
// function that takes a repository name and tag reference and returns a
// trusted digest reference.
func rewriteDockerfileFrom(dockerfileName string, translator func(string, string) (string, error)) (newDockerfile *trustedDockerfile, resolvedTags []*resolvedTag, err error) {
	dockerfile, err := os.Open(dockerfileName)
	if err != nil {
		return nil, nil, fmt.Errorf("unable to open Dockerfile: %v", err)
	}
	defer dockerfile.Close()

	scanner := bufio.NewScanner(dockerfile)

	// Make a tempfile to store the rewritten Dockerfile.
	tempFile, err := ioutil.TempFile("", "trusted-dockerfile-")
	if err != nil {
		return nil, nil, fmt.Errorf("unable to make temporary trusted Dockerfile: %v", err)
	}

	trustedFile := &trustedDockerfile{
		File: tempFile,
	}

	defer func() {
		if err != nil {
			// Close the tempfile if there was an error during Notary lookups.
			// Otherwise the caller should close it.
			trustedFile.Close()
		}
	}()

	// Scan the lines of the Dockerfile, looking for a "FROM" line.
	for scanner.Scan() {
		line := scanner.Text()

		matches := dockerfileFromLinePattern.FindStringSubmatch(line)
		if matches != nil && matches[1] != "scratch" {
			// Replace the line with a resolved "FROM repo@digest"

			// repoInfo, err := registry.ParseRepositoryInfo(repo)
			// if err != nil {
			// 	return nil, nil, fmt.Errorf("unable to parse repository info %q: %v", repo, err)
			// }
		}

		n, err := fmt.Fprintln(tempFile, line)
		if err != nil {
			return nil, nil, err
		}

		trustedFile.size += int64(n)
	}

	tempFile.Seek(0, os.SEEK_SET)

	return trustedFile, resolvedTags, scanner.Err()
}

// replaceDockerfileTarWrapper wraps the given input tar archive stream and
// replaces the entry with the given Dockerfile name with the contents of the
// new Dockerfile. Returns a new tar archive stream with the replaced
// Dockerfile.
func replaceDockerfileTarWrapper(inputTarStream io.ReadCloser, newDockerfile *trustedDockerfile, dockerfileName string) io.ReadCloser {
	pipeReader, pipeWriter := io.Pipe()

	go func() {
		tarReader := tar.NewReader(inputTarStream)
		tarWriter := tar.NewWriter(pipeWriter)

		defer inputTarStream.Close()

		for {
			hdr, err := tarReader.Next()
			if err == io.EOF {
				// Signals end of archive.
				tarWriter.Close()
				pipeWriter.Close()
				return
			}
			if err != nil {
				pipeWriter.CloseWithError(err)
				return
			}

			var content io.Reader = tarReader

			if hdr.Name == dockerfileName {
				// This entry is the Dockerfile. Since the tar archive was
				// generated from a directory on the local filesystem, the
				// Dockerfile will only appear once in the archive.
				hdr.Size = newDockerfile.size
				content = newDockerfile
			}

			if err := tarWriter.WriteHeader(hdr); err != nil {
				pipeWriter.CloseWithError(err)
				return
			}

			if _, err := io.Copy(tarWriter, content); err != nil {
				pipeWriter.CloseWithError(err)
				return
			}
		}
	}()

	return pipeReader
}
