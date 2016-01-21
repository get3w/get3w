package storage

import (
	"encoding/base64"
	"fmt"
	"io"
	"io/ioutil"
	"os"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/home"
	"github.com/get3w/get3w/pkg/ioutils"
	"github.com/get3w/get3w/pkg/stringutils"
)

// Push local to cloud.
func (parser *Parser) Push(authConfig *home.AuthConfig, out io.Writer) (shouldLogin bool, err error) {
	if authConfig.Username == "" || authConfig.AccessToken == "" {
		return true, fmt.Errorf("ERROR: Authentication failed\n")
	}

	client := get3w.NewClient(authConfig.AccessToken)
	output, _, err := client.Apps.FilesChecksum(parser.Owner, parser.Name)
	if err != nil {
		return false, err
	}
	files := output.Files

	localFiles, err := parser.Storage.GetAllFiles(parser.Storage.GetSourcePrefix(""))
	if err != nil {
		return false, err
	}

	// 1 specified add, 0 specified edit, -1 specified delete
	pathMap := make(map[string]int)

	for _, localFile := range localFiles {
		if localFile.IsDir || parser.IsLocalFile(localFile) {
			continue
		}
		checksum := files[localFile.Path]
		if checksum == "" {
			pathMap[localFile.Path] = 1
		} else {
			localChecksum, _ := parser.Storage.Checksum(parser.Storage.GetSourceKey(localFile.Path))
			if checksum != localChecksum {
				pathMap[localFile.Path] = 0
			}
		}
	}
	for path := range files {
		if !parser.Storage.IsExist(parser.Storage.GetSourceKey(path)) {
			pathMap[path] = -1
		}
	}

	fmt.Fprintf(out, "Local repository: %s\n", parser.Path)
	fmt.Fprintf(out, "Remote repository: %s/%s\n", parser.Owner, parser.Name)

	if len(pathMap) == 0 {
		fmt.Fprintln(out, "Everything up-to-date")
		return false, nil
	}

	gzPath := home.Path(stringutils.UUID() + ".tar.gz")

	err = ioutils.Pack(gzPath, parser.Path, pathMap)
	if err != nil {
		return false, err
	}

	data, err := ioutil.ReadFile(gzPath)
	if err != nil {
		return false, err
	}
	os.Remove(gzPath)

	blob := base64.StdEncoding.EncodeToString(data)

	input := &get3w.FilesPushInput{
		Blob: blob,
	}

	for path, val := range pathMap {
		if val > 0 {
			fmt.Fprintf(out, "\t+added:%s\n", path)
			input.Added = append(input.Added, path)
		}
	}
	for path, val := range pathMap {
		if val < 0 {
			fmt.Fprintf(out, "\t-removed:%s\n", path)
			input.Removed = append(input.Removed, path)
		}
	}
	for path, val := range pathMap {
		if val == 0 {
			fmt.Fprintf(out, "\tmodified:%s\n", path)
			input.Modified = append(input.Modified, path)
		}
	}

	_, _, err = client.Apps.FilesPush(parser.Owner, parser.Name, input)
	if err != nil {
		return false, err
	}

	fmt.Fprintln(out, "done.")
	return false, nil
}
