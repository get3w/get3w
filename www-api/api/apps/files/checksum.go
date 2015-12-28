package files

import (
	"net/http"

	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/bairongsoft/get3w-utils/utils"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-api/api"

	"github.com/labstack/echo"
)

// Checksum get path and checksum map of all files, dedicated to cli
func Checksum(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")

	app, err := dao.NewAppDAO().GetApp(owner, name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewS3Parser(utils.BucketAppSource, utils.BucketAppDestination, app.Owner, app.Name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	files, err := parser.Storage.GetAllFiles(parser.Storage.GetSourcePrefix(""))
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	output := &get3w.FilesChecksumOutput{
		Files: make(map[string]string),
	}

	for _, file := range files {
		output.Files[file.Path] = file.Checksum
	}

	return c.JSON(http.StatusOK, output)
}
